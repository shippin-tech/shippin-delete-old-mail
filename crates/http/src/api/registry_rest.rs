//! `/api/v1/registry`: a thin REST facade over the native JMAP registry methods (api/DESIGN.md).
//!
//! One REST request is one JMAP request, run with the caller's own access token, so JMAP decides
//! what the caller may read or change. The facade has no rules of its own: it maps verbs and
//! statuses and turns JMAP errors into problem documents. Mail data (Mailbox, Email, ...) is not
//! here; it stays in standard JMAP.
//!
//!   GET    /registry/{object}            list (collections) or the one record (singletons)
//!   GET    /registry/{object}/{id}       one record
//!   POST   /registry/{object}            create (collections)
//!   PATCH  /registry/{object}/{id}       change (collections); /registry/{object} for singletons
//!   DELETE /registry/{object}/{id}       remove (collections)

use crate::api::v1::problem_with_fields;
use crate::auth::authenticate::Authenticator;
use common::{Server, auth::AccessToken};
use http_proto::{HttpRequest, HttpResponse, HttpSessionData, JsonResponse, ToHttpResponse};
use hyper::{Method, StatusCode};
use jmap::api::request::RequestHandler;
use jmap_proto::request::Request;
use registry::{
    schema::prelude::{OBJ_SINGLETON, ObjectType},
    types::EnumImpl,
};
use serde_json::{Map, Value, json};
use utils::url_params::UrlParams;

const DEFAULT_LIMIT: u64 = 50;
const MAX_LIMIT: u64 = 500;
const SINGLETON_ID: &str = "singleton";

type Reply = trc::Result<HttpResponse>;

fn problem(status: StatusCode, kind: &str, title: &str, detail: Option<&str>) -> Reply {
    problem_with_fields(status, kind, title, detail, None)
}

fn ok(status: StatusCode, body: Value) -> Reply {
    Ok(JsonResponse::with_status(status, body).no_cache().into_http_response())
}

/// Runs a JMAP request with the caller's token and returns its method responses.
async fn jmap(
    server: &Server,
    token: &AccessToken,
    session: &HttpSessionData,
    calls: Vec<Value>,
) -> trc::Result<Vec<Value>> {
    let body = json!({
        "using": ["urn:ietf:params:jmap:core", "urn:shippin.tech:jmap"],
        "methodCalls": calls,
    })
    .to_string();
    let request = Request::parse(body.as_bytes(), 4, 1024 * 1024)?;
    let response = server.handle_jmap_request(request, token, session).await;
    let value = serde_json::to_value(&response).unwrap_or(Value::Null);
    Ok(value
        .get("methodResponses")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}

/// The arguments of a method response, or the problem for a method-level JMAP error.
fn method_args<'a>(responses: &'a [Value], index: usize, name: &str) -> Result<&'a Value, Box<Reply>> {
    let Some(entry) = responses.get(index) else {
        return Err(Box::new(problem(
            StatusCode::BAD_GATEWAY,
            "malformed-upstream",
            "The server returned no answer",
            None,
        )));
    };
    let args = entry.get(1).unwrap_or(&Value::Null);
    if entry.get(0).and_then(Value::as_str) == Some("error") {
        let kind = args.get("type").and_then(Value::as_str).unwrap_or("serverFail");
        let detail = args.get("description").and_then(Value::as_str);
        let (status, title) = match kind {
            "forbidden" => (StatusCode::FORBIDDEN, "Not allowed"),
            "unknownMethod" => (StatusCode::NOT_FOUND, "No such object type"),
            "invalidArguments" | "unsupportedFilter" | "unsupportedSort" => {
                (StatusCode::BAD_REQUEST, "The request is not valid")
            }
            "serverUnavailable" | "serverPartialFail" => {
                (StatusCode::SERVICE_UNAVAILABLE, "The server cannot do that now")
            }
            _ => (StatusCode::INTERNAL_SERVER_ERROR, "The server failed"),
        };
        return Err(Box::new(problem(status, kind, title, detail)));
    }
    if entry.get(0).and_then(Value::as_str) != Some(name) {
        return Err(Box::new(problem(
            StatusCode::BAD_GATEWAY,
            "malformed-upstream",
            "The server answered a different method",
            Some(name),
        )));
    }
    Ok(args)
}

/// A JMAP SetError (`notCreated`, `notUpdated`, `notDestroyed` entry) as a problem document.
fn set_problem(error: &Value) -> Reply {
    let kind = error.get("type").and_then(Value::as_str).unwrap_or("rejected");
    let detail = error.get("description").and_then(Value::as_str);
    let (status, title) = match kind {
        "forbidden" => (StatusCode::FORBIDDEN, "Not allowed"),
        "notFound" => (StatusCode::NOT_FOUND, "No such record"),
        "singleton" => (StatusCode::METHOD_NOT_ALLOWED, "That object has exactly one record"),
        "primaryKeyViolation" | "alreadyExists" | "objectIsLinked" | "willDestroy" => {
            (StatusCode::CONFLICT, "The change conflicts with existing data")
        }
        "tooLarge" => (StatusCode::PAYLOAD_TOO_LARGE, "Too large"),
        "rateLimit" => (StatusCode::TOO_MANY_REQUESTS, "Too many requests"),
        _ => (StatusCode::UNPROCESSABLE_ENTITY, "The change was not accepted"),
    };
    // One message per property the server named, keyed by its path (`a/b/c`).
    let fields = error
        .get("properties")
        .and_then(Value::as_array)
        .map(|names| {
            names
                .iter()
                .filter_map(Value::as_str)
                .map(|name| (name.to_string(), Value::String(detail.unwrap_or("Not valid").to_string())))
                .collect::<Map<String, Value>>()
        })
        .filter(|fields| !fields.is_empty());
    problem_with_fields(status, kind, title, detail, fields)
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn body_object(body: &Option<Vec<u8>>) -> Result<Map<String, Value>, Box<Reply>> {
    let bad = |detail: &str| {
        Box::new(problem(
            StatusCode::BAD_REQUEST,
            "invalid-body",
            "The request body must be a JSON object",
            Some(detail),
        ))
    };
    let Some(bytes) = body else {
        return Err(bad("The body is missing"));
    };
    match serde_json::from_slice::<Value>(bytes) {
        Ok(Value::Object(map)) => Ok(map),
        Ok(_) => Err(bad("It is not an object")),
        Err(_) => Err(bad("It is not valid JSON")),
    }
}

pub async fn handle_registry(
    server: &Server,
    req: &HttpRequest,
    session: &HttpSessionData,
    path: &[&str],
    body: Option<Vec<u8>>,
) -> Reply {
    // Sign-in first: an anonymous caller learns nothing, not even which object types exist.
    let (_in_flight, token) = server.authenticate_headers(req, session).await?;

    let Some(name) = path.first().copied() else {
        return problem(StatusCode::NOT_FOUND, "not-found", "No such route", None);
    };
    let Some(object) = ObjectType::parse(name) else {
        return problem(
            StatusCode::NOT_FOUND,
            "unknown-object",
            "No such object type",
            Some(name),
        );
    };
    let singleton = object.flags() & OBJ_SINGLETON != 0;
    let id = path.get(1).copied();
    if path.len() > 2 || id.is_some_and(|id| !valid_id(id)) {
        return problem(StatusCode::NOT_FOUND, "not-found", "No such route", None);
    }
    if singleton && id.is_some_and(|id| id != SINGLETON_ID) {
        return problem(StatusCode::NOT_FOUND, "not-found", "No such record", None);
    }
    // A singleton is addressed by its type alone.
    let id = if singleton { Some(SINGLETON_ID) } else { id };
    let method = |op: &str| format!("x:{name}/{op}");

    match (req.method().clone(), id, singleton) {
        // Collection: list
        (Method::GET, None, false) => {
            let params = UrlParams::new(req.uri().query());
            let limit = match params.get("limit") {
                None => DEFAULT_LIMIT,
                Some(raw) => match raw.parse::<u64>() {
                    Ok(n) if (1..=MAX_LIMIT).contains(&n) => n,
                    _ => {
                        return problem(
                            StatusCode::BAD_REQUEST,
                            "invalid-parameter",
                            "limit must be a whole number from 1 to 500",
                            Some(raw),
                        );
                    }
                },
            };
            let position = match params.get("position") {
                None => 0,
                Some(raw) => match raw.parse::<u64>() {
                    Ok(n) => n,
                    Err(_) => {
                        return problem(
                            StatusCode::BAD_REQUEST,
                            "invalid-parameter",
                            "position must be a whole number",
                            Some(raw),
                        );
                    }
                },
            };
            let mut query = json!({ "limit": limit, "position": position, "calculateTotal": true });
            if let Some(raw) = params.get("filter") {
                match serde_json::from_str::<Value>(raw) {
                    Ok(filter @ Value::Object(_)) => query["filter"] = filter,
                    _ => {
                        return problem(
                            StatusCode::BAD_REQUEST,
                            "invalid-parameter",
                            "filter must be a JSON object",
                            None,
                        );
                    }
                }
            }
            let query_name = method("query");
            let get_name = method("get");
            let responses = jmap(
                server,
                &token,
                session,
                vec![
                    json!([query_name, query, "q"]),
                    json!([get_name, {
                        "#ids": { "resultOf": "q", "name": query_name, "path": "/ids" }
                    }, "g"]),
                ],
            )
            .await?;
            let found = match method_args(&responses, 0, &query_name) {
                Ok(args) => args,
                Err(reply) => return *reply,
            };
            let got = match method_args(&responses, 1, &get_name) {
                Ok(args) => args,
                Err(reply) => return *reply,
            };
            let mut out = Map::new();
            out.insert("items".into(), got.get("list").cloned().unwrap_or_else(|| json!([])));
            out.insert("position".into(), found.get("position").cloned().unwrap_or(json!(position)));
            if let Some(total) = found.get("total") {
                out.insert("total".into(), total.clone());
            }
            ok(StatusCode::OK, Value::Object(out))
        }
        // One record (a collection's by id, a singleton's by type)
        (Method::GET, Some(id), _) => {
            let get_name = method("get");
            let responses = jmap(server, &token, session, vec![json!([get_name, { "ids": [id] }, "g"])]).await?;
            let got = match method_args(&responses, 0, &get_name) {
                Ok(args) => args,
                Err(reply) => return *reply,
            };
            match got.get("list").and_then(Value::as_array).and_then(|list| list.first()) {
                Some(item) => ok(StatusCode::OK, item.clone()),
                None => problem(StatusCode::NOT_FOUND, "notFound", "No such record", Some(id)),
            }
        }
        // Create
        (Method::POST, None, false) => {
            let record = match body_object(&body) {
                Ok(map) => map,
                Err(reply) => return *reply,
            };
            let set_name = method("set");
            let responses = jmap(
                server,
                &token,
                session,
                vec![json!([set_name, { "create": { "c": record } }, "s"])],
            )
            .await?;
            let set = match method_args(&responses, 0, &set_name) {
                Ok(args) => args,
                Err(reply) => return *reply,
            };
            if let Some(created) = set.get("created").and_then(|c| c.get("c")) {
                ok(StatusCode::CREATED, created.clone())
            } else {
                set_problem(set.get("notCreated").and_then(|c| c.get("c")).unwrap_or(&Value::Null))
            }
        }
        // Change: the JMAP patch object, so `"a/b": value` changes one nested value. The answer
        // is the changed record as it is now.
        (Method::PATCH, Some(id), _) => {
            let patch = match body_object(&body) {
                Ok(map) => map,
                Err(reply) => return *reply,
            };
            let set_name = method("set");
            let get_name = method("get");
            let responses = jmap(
                server,
                &token,
                session,
                vec![
                    json!([set_name, { "update": { id: patch } }, "s"]),
                    json!([get_name, { "ids": [id] }, "g"]),
                ],
            )
            .await?;
            let set = match method_args(&responses, 0, &set_name) {
                Ok(args) => args,
                Err(reply) => return *reply,
            };
            if set.get("updated").and_then(|u| u.get(id)).is_none() {
                return set_problem(set.get("notUpdated").and_then(|u| u.get(id)).unwrap_or(&Value::Null));
            }
            let got = match method_args(&responses, 1, &get_name) {
                Ok(args) => args,
                Err(reply) => return *reply,
            };
            match got.get("list").and_then(Value::as_array).and_then(|list| list.first()) {
                Some(item) => ok(StatusCode::OK, item.clone()),
                None => problem(StatusCode::NOT_FOUND, "notFound", "No such record", Some(id)),
            }
        }
        // Remove
        (Method::DELETE, Some(id), false) => {
            let set_name = method("set");
            let responses = jmap(server, &token, session, vec![json!([set_name, { "destroy": [id] }, "s"])]).await?;
            let set = match method_args(&responses, 0, &set_name) {
                Ok(args) => args,
                Err(reply) => return *reply,
            };
            let removed = set
                .get("destroyed")
                .and_then(Value::as_array)
                .is_some_and(|ids| ids.iter().any(|v| v.as_str() == Some(id)));
            if removed {
                Ok(HttpResponse::new(StatusCode::NO_CONTENT).with_no_cache())
            } else {
                set_problem(set.get("notDestroyed").and_then(|d| d.get(id)).unwrap_or(&Value::Null))
            }
        }
        _ => problem(
            StatusCode::METHOD_NOT_ALLOWED,
            "method-not-allowed",
            "That verb does not apply here",
            None,
        ),
    }
}
