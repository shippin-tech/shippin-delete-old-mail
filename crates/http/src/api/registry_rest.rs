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

/// The properties the server sets itself, per object type, from the schema this server ships
/// (`serverSet` in resources/schema/schema.json.gz). They can change with no one editing the record
/// (a new domain's DNS zone gains its DKIM keys a moment after it is made), so they are left out of
/// the entity tag: it follows what a person can change.
fn server_set() -> &'static std::collections::HashMap<String, Vec<String>> {
    use std::{collections::HashMap, io::Read, sync::OnceLock};
    static TABLE: OnceLock<HashMap<String, Vec<String>>> = OnceLock::new();
    TABLE.get_or_init(|| {
        const SCHEMA: &[u8] = include_bytes!("../../../../resources/schema/schema.json.gz");
        let mut text = String::new();
        if flate2::read::GzDecoder::new(SCHEMA).read_to_string(&mut text).is_err() {
            return HashMap::new();
        }
        let schema: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        let mut table = HashMap::new();
        for (object, def) in schema.get("fields").and_then(Value::as_object).into_iter().flatten() {
            let names = def
                .get("properties")
                .and_then(Value::as_object)
                .into_iter()
                .flatten()
                .filter(|(_, property)| property.get("update").and_then(Value::as_str) == Some("serverSet"))
                .map(|(name, _)| name.clone())
                .collect::<Vec<_>>();
            table.insert(object.clone(), names);
        }
        table
    })
}

/// A record's entity tag: a hash of the properties a person can change, as the server serialises
/// them. The registry keeps no per-record version, so a change to any of those is what makes an
/// earlier tag stale.
fn etag_of(object: &str, item: &Value) -> String {
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    use sha2::{Digest, Sha256};
    let skip = server_set().get(&format!("x:{object}"));
    let mut editable = item.clone();
    if let (Some(map), Some(skip)) = (editable.as_object_mut(), skip) {
        for name in skip {
            map.remove(name);
        }
    }
    let digest = Sha256::digest(editable.to_string().as_bytes());
    format!("\"{}\"", URL_SAFE_NO_PAD.encode(&digest[..16]))
}

fn record_reply(status: StatusCode, object: &str, item: &Value) -> Reply {
    Ok(JsonResponse::with_status(status, item.clone())
        .no_cache()
        .into_http_response()
        .with_etag(etag_of(object, item)))
}

/// Honours `If-Match` on a change or a removal: the record must still be the one the caller read.
/// Without the header the change is applied as before. The check and the change are two JMAP calls,
/// so two writers arriving within the same instant can still both pass; it stops the common case of
/// saving over a change made since the form was opened.
async fn check_if_match(
    server: &Server,
    token: &AccessToken,
    session: &HttpSessionData,
    req: &HttpRequest,
    object: &str,
    get_name: &str,
    id: &str,
) -> Result<(), Box<Reply>> {
    let Some(wanted) = req.headers().get(hyper::header::IF_MATCH) else {
        return Ok(());
    };
    let wanted = wanted.to_str().unwrap_or("").trim().to_string();
    let responses = jmap(server, token, session, vec![json!([get_name, { "ids": [id] }, "g"])])
        .await
        .map_err(|e| Box::new(Err(e)))?;
    let got = method_args(&responses, 0, get_name)?;
    let Some(item) = got.get("list").and_then(Value::as_array).and_then(|list| list.first()) else {
        return Err(Box::new(problem(StatusCode::NOT_FOUND, "notFound", "No such record", Some(id))));
    };
    if wanted == "*" || wanted.split(',').any(|tag| tag.trim() == etag_of(object, item)) {
        Ok(())
    } else {
        Err(Box::new(problem(
            StatusCode::PRECONDITION_FAILED,
            "stale",
            "The record changed after you read it",
            Some("Read it again and repeat the change."),
        )))
    }
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
            // `sort=name` ascending, `sort=-name` descending: one property, as JMAP's `sort` takes it.
            if let Some(raw) = params.get("sort") {
                let (property, ascending) = match raw.strip_prefix('-') {
                    Some(rest) => (rest, false),
                    None => (&*raw, true),
                };
                if property.is_empty()
                    || property.len() > 64
                    || !property.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                {
                    return problem(
                        StatusCode::BAD_REQUEST,
                        "invalid-parameter",
                        "sort must be a property name, optionally led by '-' for descending",
                        Some(&*raw),
                    );
                }
                query["sort"] = json!([{ "property": property, "isAscending": ascending }]);
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
                Some(item) => record_reply(StatusCode::OK, name, item),
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
            if let Err(reply) = check_if_match(server, &token, session, req, name, &get_name, id).await {
                return *reply;
            }
            let mut calls = vec![json!([set_name, { "update": { id: patch } }, "s"])];
            if object != ObjectType::Bootstrap {
                calls.push(json!([get_name, { "ids": [id] }, "g"]));
            }
            let responses = jmap(server, &token, session, calls).await?;
            let set = match method_args(&responses, 0, &set_name) {
                Ok(args) => args,
                Err(reply) => return *reply,
            };
            let Some(updated) = set.get("updated").and_then(|u| u.get(id)) else {
                return set_problem(set.get("notUpdated").and_then(|u| u.get(id)).unwrap_or(&Value::Null));
            };
            // Bootstrap creates credentials in the update response only. Reading the
            // defaults again loses them, leaving the person unable to sign in after
            // restarting. Return that one-time result without caching it or an ETag.
            if object == ObjectType::Bootstrap {
                let mut result = updated.as_object().cloned().unwrap_or_default();
                result.insert("id".into(), Value::String(id.to_string()));
                return ok(StatusCode::OK, Value::Object(result));
            }
            let got = match method_args(&responses, 1, &get_name) {
                Ok(args) => args,
                Err(reply) => return *reply,
            };
            match got.get("list").and_then(Value::as_array).and_then(|list| list.first()) {
                Some(item) => record_reply(StatusCode::OK, name, item),
                None => problem(StatusCode::NOT_FOUND, "notFound", "No such record", Some(id)),
            }
        }
        // Remove
        (Method::DELETE, Some(id), false) => {
            let set_name = method("set");
            if let Err(reply) = check_if_match(server, &token, session, req, name, &method("get"), id).await {
                return *reply;
            }
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
