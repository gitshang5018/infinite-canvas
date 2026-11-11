// Windows 发布版不附带额外控制台窗口。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    infinite_canvas_desktop_lib::run()
}
