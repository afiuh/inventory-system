#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
个人物品管理系统 - 本地服务器启动脚本
用法：python start_server.py
"""

import http.server
import socketserver
import webbrowser
import os
import sys
import threading
import time
import json

# 配置
PORT = 8888
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class CustomHandler(http.server.SimpleHTTPRequestHandler):
    """自定义请求处理器，设置正确的目录"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format, *args):
        """自定义日志格式"""
        print(f"[{self.log_date_time_string()}] {format % args}")

    def do_GET(self):
        """处理 GET 请求"""
        if self.path == "/api/status":
            # API 状态端点
            response = {
                "service": "录音分析工具 API",
                "version": "1.0.0",
                "status": "running"
            }
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode("utf-8"))
        else:
            # 其他请求使用默认处理
            super().do_GET()


class ReuseAddrTCPServer(socketserver.TCPServer):
    """允许地址重用的 TCP 服务器"""
    allow_reuse_address = True


def start_server():
    """启动 HTTP 服务器"""
    with ReuseAddrTCPServer(("", PORT), CustomHandler) as httpd:
        print(f"✅ 服务器已启动")
        print(f"📁 项目目录：{DIRECTORY}")
        print(f"🌐 访问地址：http://localhost:{PORT}")
        print(f"📋 按 Ctrl+C 停止服务器")
        print("=" * 50)
        httpd.serve_forever()


def open_browser():
    """延迟打开浏览器"""
    time.sleep(1.5)  # 等待服务器启动
    webbrowser.open(f"http://localhost:{PORT}")


if __name__ == "__main__":
    try:
        # 检查项目文件是否存在
        if not os.path.exists(os.path.join(DIRECTORY, "index.html")):
            print("❌ 错误：未找到 index.html 文件")
            print(f"   请确保此脚本与 index.html 在同一目录")
            sys.exit(1)

        print("=" * 50)
        print("🎯 个人物品管理系统 - 启动中...")
        print("=" * 50)

        # 在新线程中启动服务器
        server_thread = threading.Thread(target=start_server, daemon=True)
        server_thread.start()

        # 打开浏览器
        open_browser()

        # 保持主线程运行
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n⚠️  服务器已停止")
    except OSError as e:
        if e.errno == 98 or e.winerror == 10048:  # Linux 或 Windows 端口被占用
            print(f"❌ 错误：端口 {PORT} 已被占用")
            print("   请关闭占用该端口的程序，或修改 PORT 变量换一个端口")
        else:
            print(f"❌ 错误：{e}")
    except Exception as e:
        print(f"❌ 错误：{e}")
        sys.exit(1)