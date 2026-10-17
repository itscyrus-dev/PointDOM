//! Native PointDOM service, durable MCP task inbox and stdio transport.
//! Browser clients never receive filesystem, process or credential capabilities.
pub mod clients;
pub mod config;
pub mod discovery;
pub mod error;
pub mod http;
pub mod mcp;
pub mod model;
pub mod service;
pub mod store;
pub use error::{Error, Result};
pub use service::Service;
