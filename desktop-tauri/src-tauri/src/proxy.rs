use std::net::SocketAddr;

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::Response;
use axum::routing::{any, get};
use axum::Router;
use percent_encoding::percent_decode_str;
use tokio::net::TcpListener;

/// 与前端 DEFAULT_LOCAL_PROXY_URL 保持一致。
const PROXY_PORT: u16 = 23210;
const PROXY_HOST: &str = "127.0.0.1";

/// 描述本跳而非上游请求的请求头。
const SKIP_REQUEST_HEADERS: &[&str] = &[
    "host",
    "connection",
    "content-length",
    "accept-encoding",
    "origin",
    "referer",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
];

/// fetch() 已经解码并重新分帧请求体，上游的分帧头不再适用。
const SKIP_RESPONSE_HEADERS: &[&str] = &[
    "content-encoding",
    "content-length",
    "transfer-encoding",
    "connection",
    "keep-alive",
];

pub fn local_proxy_url() -> String {
    format!("http://{PROXY_HOST}:{PROXY_PORT}")
}

/// 启动内置代理服务；端口已被占用时视为已有代理在运行，直接跳过。
pub fn spawn_proxy_server() {
    let url = local_proxy_url();
    tauri::async_runtime::spawn(async move {
        let addr: SocketAddr = format!("{PROXY_HOST}:{PROXY_PORT}")
            .parse()
            .expect("invalid proxy address");

        let listener = match TcpListener::bind(addr).await {
            Ok(listener) => listener,
            Err(error) => {
                // 端口已占用通常意味着本机已经运行了代理，此时直接复用即可。
                println!("[proxy] 端口 {PROXY_PORT} 不可用（{error}），跳过内置代理启动");
                return;
            }
        };

        let app = Router::new()
            .route("/", get(proxy_info))
            .fallback(any(proxy_forward))
            .with_state(());

        println!("[proxy] 内置本地代理已启动：{url}");
        if let Err(error) = axum::serve(listener, app).await {
            eprintln!("[proxy] 代理服务异常退出：{error}");
        }
    });
}

fn cors_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_MAX_AGE,
        HeaderValue::from_static("86400"),
    );
    headers
}

/// 解析 `/{完整目标地址}` 形式的路径，返回可直接请求的上游地址。
fn read_target(url: &str) -> Option<String> {
    let raw = url.strip_prefix('/').unwrap_or(url);
    // decodeURI 还原浏览器对路径做的转义，同时保留有意为之的 encodeURIComponent 转义。
    let decoded = percent_decode_str(raw).decode_utf8_lossy().to_string();
    // 部分客户端会折叠内嵌目标地址里的 "//"，先补回再校验。
    let normalized = if let Some(rest) = decoded.strip_prefix("https:/") {
        format!("https://{rest}")
    } else if let Some(rest) = decoded.strip_prefix("http:/") {
        format!("http://{rest}")
    } else {
        decoded
    };

    if !(normalized.starts_with("http://") || normalized.starts_with("https://")) {
        return None;
    }
    // 必须是带主机名的完整地址，避免把本地路径当成上游。
    let after_scheme = normalized.split_once("://").map(|(_, rest)| rest)?;
    if after_scheme.is_empty() || after_scheme.starts_with('/') {
        return None;
    }
    Some(normalized)
}

/// 用给定的状态码与响应头构造响应。
fn build_response(status: StatusCode, headers: HeaderMap, body: Body) -> Response {
    let mut response = Response::builder().status(status);
    // Builder 只提供单个 header 的设置接口，这里逐个写入已合并好的响应头。
    for (name, value) in headers.iter() {
        response = response.header(name.clone(), value.clone());
    }
    response.body(body).unwrap_or_else(|_| Response::new(Body::empty()))
}

fn json_response(status: StatusCode, payload: &serde_json::Value) -> Response {
    let body = serde_json::to_vec(payload).unwrap_or_else(|_| b"{}".to_vec());
    let mut headers = cors_headers();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json; charset=utf-8"),
    );
    build_response(status, headers, Body::from(body))
}

fn request_headers(headers: &HeaderMap) -> HeaderMap {
    let mut result = HeaderMap::new();
    for (name, value) in headers.iter() {
        if SKIP_REQUEST_HEADERS.contains(&name.as_str()) {
            continue;
        }
        result.insert(name.clone(), value.clone());
    }
    result
}

fn response_headers(upstream: &HeaderMap) -> HeaderMap {
    let mut headers = cors_headers();
    for (name, value) in upstream.iter() {
        if SKIP_RESPONSE_HEADERS.contains(&name.as_str()) || name.as_str().starts_with("access-control-") {
            continue;
        }
        headers.insert(name.clone(), value.clone());
    }
    headers
}

async fn proxy_info() -> Response {
    let payload = serde_json::json!({
        "app": "infinite-canvas",
        "proxy": "@basketikun/canvas-proxy",
        "version": env!("CARGO_PKG_VERSION"),
        "usage": "/<full-target-url>",
    });
    json_response(StatusCode::OK, &payload)
}

async fn proxy_forward(State(_): State<()>, request: Request) -> Response {
    let method = request.method().clone();
    let headers = request.headers().clone();
    let uri = request.uri().clone();
    let body = axum::body::to_bytes(request.into_body(), 64 * 1024 * 1024)
        .await
        .map(|bytes| bytes.to_vec())
        .unwrap_or_default();

    if method == Method::OPTIONS {
        return build_response(StatusCode::NO_CONTENT, cors_headers(), Body::empty());
    }

    let path = uri.path();
    let query = uri.query().map(|q| format!("?{q}")).unwrap_or_default();
    let Some(target) = read_target(&format!("{path}{query}")) else {
        return json_response(
            StatusCode::OK,
            &serde_json::json!({
                "app": "infinite-canvas",
                "proxy": "@basketikun/canvas-proxy",
                "version": env!("CARGO_PKG_VERSION"),
                "usage": "/<full-target-url>",
            }),
        );
    };

    let client = reqwest::Client::new();
    let mut outgoing = client.request(method, &target);
    outgoing = outgoing.headers(request_headers(&headers));
    if !body.is_empty() {
        outgoing = outgoing.body(body);
    }

    match outgoing.send().await {
        Ok(upstream) => {
            let status = upstream.status();
            let headers = response_headers(upstream.headers());
            // 以流的方式转发，SSE 响应才能逐块送达浏览器。
            let stream = upstream.bytes_stream();
            build_response(status, headers, Body::from_stream(stream))
        }
        Err(error) => {
            eprintln!("[proxy] 转发失败 {target}: {error}");
            json_response(
                StatusCode::BAD_GATEWAY,
                &serde_json::json!({ "error": error.to_string() }),
            )
        }
    }
}
