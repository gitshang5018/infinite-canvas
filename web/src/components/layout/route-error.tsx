import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";

import { DesktopTitlebar } from "@/components/layout/desktop-titlebar";

export function RouteError() {
    const error = useRouteError();
    let errorMessage = "发生未知应用异常";
    let errorDetail = "";

    if (isRouteErrorResponse(error)) {
        errorMessage = `${error.status} ${error.statusText}`;
        if (typeof error.data === "string") {
            errorDetail = error.data;
        }
    } else if (error instanceof Error) {
        errorMessage = error.message;
        if (error.stack && process.env.NODE_ENV !== "production") {
            errorDetail = error.stack;
        }
    } else if (typeof error === "string") {
        errorMessage = error;
    }

    const handleReload = () => {
        window.location.reload();
    };

    const handleGoHome = () => {
        window.location.href = "/";
    };

    return (
        <div className="relative flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <DesktopTitlebar />
            <main className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-10 text-stone-900 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)] dark:text-stone-100">
                <section className="w-full max-w-lg text-center">
                    <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-500 shadow-sm dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
                        <AlertTriangle className="size-8" />
                    </div>
                    <h1 className="text-2xl font-semibold tracking-normal">页面发生异常</h1>
                    <p className="mt-3 text-sm leading-6 text-stone-500 dark:text-stone-400">
                        应用运行时遇到了未预期的错误，请尝试刷新页面或返回首页。
                    </p>
                    <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3 text-left font-mono text-xs text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
                        <div className="break-all font-semibold">{errorMessage}</div>
                        {errorDetail ? (
                            <pre className="mt-2 max-h-36 overflow-auto text-[11px] text-stone-500 dark:text-stone-400 whitespace-pre-wrap">
                                {errorDetail}
                            </pre>
                        ) : null}
                    </div>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <button
                            type="button"
                            onClick={handleReload}
                            className="inline-flex h-10 items-center gap-2 rounded-lg bg-stone-950 px-5 text-sm font-medium text-white transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200"
                        >
                            <RotateCcw className="size-4" />
                            重新加载
                        </button>
                        <button
                            type="button"
                            onClick={handleGoHome}
                            className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-200 bg-white px-5 text-sm font-medium text-stone-800 transition hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                        >
                            <Home className="size-4" />
                            返回首页
                        </button>
                    </div>
                </section>
            </main>
        </div>
    );
}
