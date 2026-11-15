//! `/api/v1`: the one management API (api/DESIGN.md). Each route here is a thin layer over
//! what the server already does; configuration stays in native JMAP.
//!
//! Every error uses one shape (RFC 9457 problem details).

use crate::auth::{authenticate::Authenticator, permissions::AccountApiHandler};
use common::Server;
use http_proto::{HttpRequest, HttpResponse, HttpSessionData, JsonResponse, ToHttpResponse};
use hyper::{Method, StatusCode};
use registry::schema::enums::Permission;
use serde_json::{Map, Value, json};
use std::future::Future;

/// What the interface should present, decided here and never guessed by the client:
/// `org` runs an organisation, `owner` runs a free-plan domain, `admin` operates the server,
/// otherwise `user`. Derived from live state, never stored, so it cannot disagree with what
/// the server will allow.
pub fn role_of(permissions: &[Permission], runs_org: bool, owns_domain: bool) -> &'static str {
    let has = |p: Permission| permissions.contains(&p);
    if runs_org {
        "org"
    } else if owns_domain {
        "owner"
    } else if has(Permission::SysDomainCreate) && has(Permission::SysAccountCreate) {
        "admin"
    } else {
        "user"
    }
}

pub fn problem(status: StatusCode, kind: &str, title: &str, detail: Option<&str>) -> trc::Result<HttpResponse> {
    problem_with_fields(status, kind, title, detail, None)
}

/// `fields` names what was wrong per input, keyed by path, for forms to show beside the input.
pub fn problem_with_fields(
    status: StatusCode,
    kind: &str,
    title: &str,
    detail: Option<&str>,
    fields: Option<Map<String, Value>>,
) -> trc::Result<HttpResponse> {
    let mut body = json!({ "type": kind, "title": title, "status": status.as_u16() });
    if let Some(detail) = detail {
        body["detail"] = Value::String(detail.to_string());
    }
    if let Some(fields) = fields {
        body["fields"] = Value::Object(fields);
    }
    // The same content type the rest of the server uses for errors (RFC 9457).
    Ok(HttpResponse::new(status)
        .with_content_type("application/problem+json")
        .with_no_cache()
        .with_text_body(body.to_string()))
}

pub trait V1Api: Sync + Send {
    fn handle_v1_request(
        &self,
        req: &HttpRequest,
        session: &HttpSessionData,
        path: &[&str],
        body: Option<Vec<u8>>,
    ) -> impl Future<Output = trc::Result<HttpResponse>> + Send;
}

impl V1Api for Server {
    async fn handle_v1_request(
        &self,
        req: &HttpRequest,
        session: &HttpSessionData,
        path: &[&str],
        body: Option<Vec<u8>>,
    ) -> trc::Result<HttpResponse> {
        match (req.method().clone(), path.first().copied().unwrap_or_default()) {
            (Method::GET, "me") => {
                let (_in_flight, access_token) = self.authenticate_headers(req, session).await?;
                let (account, email) = self.account_view(&access_token).await?;
                let account_id = access_token.account_id();
                let runs_org = common::orgs::org_for_admin(
                    self,
                    &types::id::Id::from(account_id).to_string(),
                )
                .await?
                .is_some();
                let owns_domain = crate::shippin::panel::owner_domain_id(self, account_id)
                    .await?
                    .is_some();
                let role = role_of(&account.permissions, runs_org, owns_domain);
                let permissions = serde_json::to_value(&account.permissions).unwrap_or(Value::Null);
                Ok(JsonResponse::new(json!({
                    "email": email,
                    "role": role,
                    "permissions": permissions,
                    "edition": account.edition,
                }))
                .no_cache()
                .into_http_response())
            }
            (_, "registry") => super::registry_rest::handle_registry(self, req, session, &path[1..], body).await,
            _ => problem(StatusCode::NOT_FOUND, "not-found", "No such route", None),
        }
    }
}
