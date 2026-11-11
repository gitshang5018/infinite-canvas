mod proxy;

use tauri::WebviewWindowBuilder;

/// 窗口控制命令：供前端自绘标题栏调用，与 Electron 版 preload 暴露的能力保持一致。
#[tauri::command]
fn desktop_window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn desktop_window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn desktop_window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

/// 桌面端运行时配置。
///
/// LOCAL_PROXY_URL 只在内置代理真正就绪时才给出，
/// 否则前端会把请求发给不可用的地址，导致所有接口调用失败。
fn runtime_config(proxy_ready: bool) -> serde_json::Value {
    serde_json::json!({
        "DESKTOP": "1",
        "LOCAL_PROXY_URL": if proxy_ready { proxy::local_proxy_url() } else { String::new() },
        "DESKTOP_PLATFORM": std::env::consts::OS,
    })
}

/// 生成在页面脚本执行前注入的配置脚本。
///
/// 前端的 runtime-config.ts 在模块加载时同步读取 window.__RUNTIME_CONFIG__，
/// 因此必须在页面脚本之前注入，等价于 Electron 版的 /config.js。
fn runtime_config_script(proxy_ready: bool) -> String {
    let payload = serde_json::to_string(&runtime_config(proxy_ready)).unwrap_or_else(|_| "{}".to_string());
    format!("window.__RUNTIME_CONFIG__ = Object.assign(window.__RUNTIME_CONFIG__ || {{}}, {payload});")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            desktop_window_minimize,
            desktop_window_toggle_maximize,
            desktop_window_close,
        ])
        .setup(|app| {
            // 内置本地代理：前端在浏览器里直连第三方 AI 接口会被跨域拦截，
            // 桌面端随应用启动代理，避免用户手动执行命令。
            // setup 是同步的，这里阻塞等待代理就绪，保证注入给前端的配置是准确的。
            let proxy_ready = tauri::async_runtime::block_on(proxy::start_proxy_server());

            // 窗口在 tauri.conf.json 中声明（decorations: false 用于自绘标题栏）。
            // 这里改为手动创建，以便在页面脚本执行前注入运行时配置。
            let config = app
                .config()
                .app
                .windows
                .first()
                .cloned()
                .ok_or("main window config missing")?;
            let window = WebviewWindowBuilder::from_config(app, &config)?
                .initialization_script(runtime_config_script(proxy_ready))
                .on_page_load(move |window, _| {
                    // 页面首帧渲染完成后再显示，避免白屏闪烁。
                    let _ = window.show();
                    let _ = window.set_focus();
                })
                .build()?;
            let _ = window.set_focus();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
