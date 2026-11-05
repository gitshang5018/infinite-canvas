use std::net::SocketAddr;

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::Response;
use axum::routing::{any, get};
use axum::Router;
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

/// decodeURI 不会解码的保留字符，解码时必须原样保留，
/// 否则会破坏 URL 的路径与查询结构。
const RESERVED_ESCAPES: &[u8] = b";/?:@&=+$,#";

/// 等价于 JavaScript 的 decodeURI：解码百分号转义，但保留保留字符的转义形式。
fn decode_uri_like(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = &raw[index + 1..index + 3];
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                if !RESERVED_ESCAPES.contains(&byte) {
                    out.push(byte);
                    index += 3;
                    continue;
                }
            }
        }
        // 非转义字节直接保留，多字节 UTF-8 会被逐字节原样复制。
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// 解析 `/{完整目标地址}` 形式的路径，返回可直接请求的上游地址。
fn read_target(url: &str) -> Option<String> {
    let raw = url.strip_prefix('/').unwrap_or(url);
    // decodeURI 还原浏览器对路径做的转义，同时保留有意为之的 encodeURIComponent 转义。
    let decoded = decode_uri_like(raw);
    // 部分客户端会折叠内嵌目标地址里的 "//"，先补回再校验。
    // 注意匹配顺序：已带 "//" 的地址要原样保留，只能在缺少斜杠时才补。
    let normalized = if let Some(rest) = decoded.strip_prefix("https://") {
        format!("https://{rest}")
    } else if let Some(rest) = decoded.strip_prefix("http://") {
        format!("http://{rest}")
    } else if let Some(rest) = decoded.strip_prefix("https:/") {
        format!("https://{rest}")
    } else if let Some(rest) = decoded.strip_prefix("http:/") {
        format!("http://{rest}")
    } else if let Some(rest) = decoded.strip_prefix("https:") {
        format!("https://{rest}")
    } else if let Some(rest) = decoded.strip_prefix("http:") {
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

#[cfg(test)]
mod tests {
    use super::{proxy_forward, read_target};
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use futures_util::StreamExt;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    /// 目标地址解析必须与 Node 版 canvas-proxy 行为一致，
    /// 否则同一请求在两个容器里会命中不同的上游地址。
    #[test]
    fn resolves_target_like_node_version() {
        let cases = [
            ("/https://api.example.com/v1/images", Some("https://api.example.com/v1/images")),
            ("/https://api.example.com/v1/a%20b", Some("https://api.example.com/v1/a b")),
            // 保留字符的转义形式必须原样保留，避免破坏 URL 结构。
            ("/https://api.example.com/v1?q=a%2Fb", Some("https://api.example.com/v1?q=a%2Fb")),
            ("/https://api.example.com/v1?q=a%3Db%26c", Some("https://api.example.com/v1?q=a%3Db%26c")),
            ("/https://api.example.com/p%2Fpath", Some("https://api.example.com/p%2Fpath")),
            // 客户端折叠斜杠时仍要还原成完整地址。
            ("/https:/api.example.com/v1", Some("https://api.example.com/v1")),
            ("/https:api.example.com/v1", Some("https://api.example.com/v1")),
            ("/http://api.example.com", Some("http://api.example.com")),
            // 缺少主机名或不是完整地址时一律拒绝。
            ("/https://", None),
            ("/notaurl", None),
            ("/", None),
        ];

        for (input, expected) in cases {
            assert_eq!(read_target(input).as_deref(), expected, "输入: {input}");
        }
    }

    /// 启动一个最小上游服务器，用于验证代理的真实转发行为。
    async fn spawn_upstream() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind upstream");
        let addr = listener.local_addr().expect("upstream addr");
        tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else { break };
                tokio::spawn(async move {
                    let mut buffer = vec![0u8; 4096];
                    let read = socket.read(&mut buffer).await.unwrap_or(0);
                    let request = String::from_utf8_lossy(&buffer[..read]).to_string();
                    let mut lines = request.lines();
                    let first = lines.next().unwrap_or_default();
                    let path = first.split_whitespace().nth(1).unwrap_or_default().to_string();

                    if path.ends_with("/sse") {
                        let head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n";
                        socket.write_all(head.as_bytes()).await.ok();
                        socket.write_all(b"data: one\n\n").await.ok();
                        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                        socket.write_all(b"data: two\n\n").await.ok();
                        socket.shutdown().await.ok();
                    } else {
                        let body = format!("{{\"path\":\"{path}\"}}");
                        let head = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nX-Upstream: yes\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                            body.len()
                        );
                        socket.write_all(head.as_bytes()).await.ok();
                        socket.write_all(body.as_bytes()).await.ok();
                        socket.shutdown().await.ok();
                    }
                });
            }
        });
        format!("http://{addr}")
    }

    /// 代理必须把请求原样转发到上游，并带上宽松的 CORS 响应头。
    #[tokio::test]
    async fn forwards_request_to_upstream_with_cors() {
        let upstream = spawn_upstream().await;
        // 代理约定路径形如 /{完整目标地址}。
        let target = format!("/{upstream}/v1/models");

        let request = Request::builder()
            .method("GET")
            .uri(&target)
            .body(Body::empty())
            .expect("build request");

        let response = proxy_forward(axum::extract::State(()), request).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get("access-control-allow-origin")
                .and_then(|value| value.to_str().ok()),
            Some("*")
        );
        assert_eq!(
            response.headers().get("x-upstream").and_then(|value| value.to_str().ok()),
            Some("yes")
        );

        let body = axum::body::to_bytes(response.into_body(), 1024 * 1024).await.expect("read body");
        let text = String::from_utf8_lossy(&body).to_string();
        assert!(text.contains("/v1/models"), "上游收到的路径不正确: {text}");
    }

    /// SSE 响应必须逐块流式返回，不能等上游结束才整体吐出。
    #[tokio::test]
    async fn streams_sse_response() {
        let upstream = spawn_upstream().await;
        // 代理约定路径形如 /{完整目标地址}。
        let target = format!("/{upstream}/sse");

        let request = Request::builder()
            .method("GET")
            .uri(&target)
            .body(Body::empty())
            .expect("build request");

        let response = proxy_forward(axum::extract::State(()), request).await;
        assert_eq!(response.status(), StatusCode::OK);

        let mut stream = response.into_body().into_data_stream();
        let mut collected = String::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.expect("stream chunk");
            collected.push_str(&String::from_utf8_lossy(&chunk));
        }
        assert!(collected.contains("data: one"), "缺少首个 SSE 分块: {collected}");
        assert!(collected.contains("data: two"), "缺少第二个 SSE 分块: {collected}");
    }

    /// CORS 预检请求必须直接返回 204 与允许头。
    #[tokio::test]
    async fn answers_preflight_request() {
        let request = Request::builder()
            .method("OPTIONS")
            .uri("/https://api.example.com/v1")
            .body(Body::empty())
            .expect("build request");

        let response = proxy_forward(axum::extract::State(()), request).await;
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert_eq!(
            response
                .headers()
                .get("access-control-allow-methods")
                .and_then(|value| value.to_str().ok()),
            Some("*")
        );
    }

    /// 顶层路径返回代理自述信息，方便用户确认代理已启动。
    #[tokio::test]
    async fn describes_itself_on_root_path() {
        let request = Request::builder()
            .method("GET")
            .uri("/")
            .body(Body::empty())
            .expect("build request");

        let response = proxy_forward(axum::extract::State(()), request).await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 1024 * 1024).await.expect("read body");
        let text = String::from_utf8_lossy(&body).to_string();
        assert!(text.contains("infinite-canvas"), "缺少代理标识: {text}");
    }
}
