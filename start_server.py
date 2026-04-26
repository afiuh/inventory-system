#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Personal Inventory System - Flask Backend Server

Author: Chen Yiling
"""

import sys
import os
import webbrowser
import time

# Fix Python path for virtual environment conflicts
SITE_PACKAGES = r'C:\Users\c3458\AppData\Local\Programs\Python\Python312\Lib\site-packages'
if SITE_PACKAGES not in sys.path:
    sys.path.insert(0, SITE_PACKAGES)

# Config
PORT = 8888
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


def main():
    """Main function"""
    global PORT
    
    # Check project files
    if not os.path.exists(os.path.join(DIRECTORY, "index.html")):
        print("[ERROR] index.html not found")
        sys.exit(1)

    try:
        # Add backend directory to Python path
        backend_dir = os.path.join(DIRECTORY, 'backend')
        sys.path.insert(0, backend_dir)
        
        from app import app
        
        print("=" * 50)
        print("  Personal Inventory System - Backend Mode")
        print("=" * 50)
        print(f"[OK] Server running at: http://localhost:{PORT}")
        print(f"[OK] Database: {os.path.join(backend_dir, 'inventory.db')}")
        print(f"[INFO] Press Ctrl+C to stop")
        print("=" * 50)
        
        # Open browser after 1.5 seconds
        def open_browser():
            time.sleep(1.5)
            webbrowser.open(f"http://localhost:{PORT}")
        
        import threading
        threading.Thread(target=open_browser, daemon=True).start()
        
        # Start Flask server
        app.run(host='0.0.0.0', port=PORT, debug=False, threaded=True)
        
    except ImportError as e:
        print(f"[ERROR] Import failed: {e}")
        print("   Please run: pip install flask flask-cors")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n[INFO] Server stopped")
    except OSError as e:
        if hasattr(e, 'winerror') and e.winerror == 10048:
            print(f"[ERROR] Port {PORT} is already in use")
            print(f"   Try: python start_server.py --port 8889")
        else:
            print(f"[ERROR] {e}")


if __name__ == "__main__":
    main()
