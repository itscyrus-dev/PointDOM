//! Sanitized errors shared by the local HTTP and native IPC boundaries.
use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Invalid(&'static str),
    #[error("{0}")]
    Conflict(&'static str),
    #[error("NOT_FOUND")]
    NotFound,
    #[error("FORBIDDEN")]
    Forbidden,
    #[error("LOCAL_STORAGE_ERROR")]
    Io(#[from] std::io::Error),
    #[error("INVALID_STORED_DATA")]
    Json(#[from] serde_json::Error),
    #[error("CLIENT_UNAVAILABLE")]
    Client,
}
pub type Result<T> = std::result::Result<T, Error>;
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let code = match self {
            Self::Forbidden => StatusCode::FORBIDDEN,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::Io(_) | Self::Json(_) => StatusCode::INTERNAL_SERVER_ERROR,
            _ => StatusCode::BAD_REQUEST,
        };
        (code, Json(json!({"error": self.to_string()}))).into_response()
    }
}
