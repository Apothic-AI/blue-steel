#!/usr/bin/env python3
"""JSON-lines interactive shell for Blue Steel Camoufox sessions.

Forked from cloverlabs-camoufox for Blue Steel. Adds coordinate mouse/keyboard
ops and base64 screenshots required by the vision agent. Do not edit the
upstream cloverlabs-camoufox skill; changes belong here.
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
import time
from pathlib import Path
from typing import Any

from camoufox_containers import CamoufoxContainers
from selenium.common.exceptions import TimeoutException
from selenium.webdriver import ActionChains
from selenium.webdriver.common.actions.action_builder import ActionBuilder
from selenium.webdriver.common.actions.mouse_button import MouseButton
from selenium.webdriver.common.actions.wheel_input import ScrollOrigin
from selenium.webdriver.common.keys import Keys


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload), flush=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Interactive Blue Steel Camoufox")
    parser.add_argument("--profile", type=Path, help="Explicit profile directory")
    parser.add_argument(
        "--profile-name",
        default="blue-steel",
        help="Named profile under ~/.camoufox/profiles (default: blue-steel)",
    )
    parser.add_argument("--geckodriver", type=Path)
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--no-container-proxy", action="store_true")
    parser.add_argument(
        "--create-if-missing",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Create selected named profile if missing",
    )
    return parser


def _viewport(driver) -> dict[str, Any]:
    data = driver.execute_script(
        """
        return {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          outerWidth: window.outerWidth,
          outerHeight: window.outerHeight,
          dpr: window.devicePixelRatio || 1,
          scrollX: window.scrollX || 0,
          scrollY: window.scrollY || 0
        };
        """
    )
    return data or {}


def _pointer_click(driver, x: float, y: float, *, button: str = "left", count: int = 1) -> None:
    btn = {
        "left": MouseButton.LEFT,
        "middle": MouseButton.MIDDLE,
        "right": MouseButton.RIGHT,
    }.get(button, MouseButton.LEFT)
    try:
        actions = ActionBuilder(driver)
        actions.pointer_action.move_to_location(int(x), int(y))
        for _ in range(max(1, int(count))):
            actions.pointer_action.click(button=btn)
        actions.perform()
        return
    except Exception:
        # Fallback: JS elementFromPoint + click (left only) or ActionChains on body
        if button == "left" and int(count) == 1:
            driver.execute_script(
                """
                const el = document.elementFromPoint(arguments[0], arguments[1]);
                if (el) el.click();
                """,
                int(x),
                int(y),
            )
            return
        body = driver.find_element("tag name", "body")
        chain = ActionChains(driver).move_to_element_with_offset(body, int(x), int(y))
        for _ in range(max(1, int(count))):
            if button == "right":
                chain.context_click()
            else:
                chain.click()
        chain.perform()


def _pointer_move(driver, x: float, y: float) -> None:
    actions = ActionBuilder(driver)
    actions.pointer_action.move_to_location(int(x), int(y))
    actions.perform()


def _pointer_down(driver, button: str = "left") -> None:
    btn = {
        "left": MouseButton.LEFT,
        "middle": MouseButton.MIDDLE,
        "right": MouseButton.RIGHT,
    }.get(button, MouseButton.LEFT)
    actions = ActionBuilder(driver)
    actions.pointer_action.pointer_down(button=btn)
    actions.perform()


def _pointer_up(driver, button: str = "left") -> None:
    btn = {
        "left": MouseButton.LEFT,
        "middle": MouseButton.MIDDLE,
        "right": MouseButton.RIGHT,
    }.get(button, MouseButton.LEFT)
    actions = ActionBuilder(driver)
    actions.pointer_action.pointer_up(button=btn)
    actions.perform()


def _pointer_drag(driver, x1: float, y1: float, x2: float, y2: float) -> None:
    actions = ActionBuilder(driver)
    actions.pointer_action.move_to_location(int(x1), int(y1))
    actions.pointer_action.pointer_down(button=MouseButton.LEFT)
    actions.pointer_action.move_to_location(int(x2), int(y2))
    actions.pointer_action.pointer_up(button=MouseButton.LEFT)
    actions.perform()


def _pointer_scroll(driver, x: float, y: float, delta_x: float, delta_y: float) -> None:
    # Prefer element-from-point wheel when possible; fall back to window scroll.
    try:
        origin = ScrollOrigin.from_viewport(int(x), int(y))
        ActionChains(driver).scroll_from_origin(origin, int(delta_x), int(delta_y)).perform()
    except Exception:
        driver.execute_script(
            "window.scrollBy(arguments[0], arguments[1]);",
            int(delta_x),
            int(delta_y),
        )


KEY_MAP = {
    "Enter": Keys.ENTER,
    "Tab": Keys.TAB,
    "Backspace": Keys.BACK_SPACE,
    "Escape": Keys.ESCAPE,
    "ArrowUp": Keys.ARROW_UP,
    "ArrowDown": Keys.ARROW_DOWN,
    "ArrowLeft": Keys.ARROW_LEFT,
    "ArrowRight": Keys.ARROW_RIGHT,
    "Home": Keys.HOME,
    "End": Keys.END,
    "PageUp": Keys.PAGE_UP,
    "PageDown": Keys.PAGE_DOWN,
    "Delete": Keys.DELETE,
    "Control": Keys.CONTROL,
    "Meta": Keys.META,
    "Alt": Keys.ALT,
    "Shift": Keys.SHIFT,
}


def _keys_type(driver, text: str, delay_ms: float = 0) -> None:
    body = driver.find_element("tag name", "body")
    if delay_ms and delay_ms > 0:
        for ch in text:
            body.send_keys(ch)
            time.sleep(float(delay_ms) / 1000.0)
    else:
        body.send_keys(text)


def _keys_press(driver, key: str) -> None:
    body = driver.find_element("tag name", "body")
    mapped = KEY_MAP.get(key, key)
    body.send_keys(mapped)


def _keys_chord(driver, keys: list[str]) -> None:
    body = driver.find_element("tag name", "body")
    mapped = [KEY_MAP.get(k, k) for k in keys]
    body.send_keys(*mapped)


def _screenshot_b64(driver) -> dict[str, Any]:
    png = driver.get_screenshot_as_png()
    b64 = base64.b64encode(png).decode("ascii")
    vp = _viewport(driver)
    return {
        "base64": b64,
        "encoding": "base64",
        "mimeType": "image/png",
        "width": vp.get("innerWidth"),
        "height": vp.get("innerHeight"),
        "dpr": vp.get("dpr", 1),
        "byteLength": len(png),
    }


def main() -> int:
    args = build_parser().parse_args()
    options: dict[str, Any] = {
        "headless": args.headless,
        "install_container_proxy": not args.no_container_proxy,
        "create_if_missing": args.create_if_missing,
    }
    if args.profile:
        options["profile"] = args.profile
    if args.profile_name:
        options["profile_name"] = args.profile_name
    if args.geckodriver:
        options["geckodriver"] = args.geckodriver

    with CamoufoxContainers(**options) as browser:
        driver = browser.driver
        assert driver is not None

        containers = None
        last_error: Exception | None = None
        for _ in range(20):
            try:
                containers = browser.list_containers()
                break
            except Exception as exc:
                last_error = exc
                time.sleep(0.5)
        if containers is None:
            assert last_error is not None
            raise last_error

        emit(
            {
                "event": "ready",
                "profile": {
                    "name": browser.profile_name,
                    "path": str(browser.profile),
                },
                "containers": containers,
                "product": "blue-steel",
            }
        )
        for line in sys.stdin:
            try:
                command = json.loads(line)
                operation = command["op"]
                if operation == "open":
                    tab = browser.open_tab(
                        command["url"],
                        container=command.get("container", "firefox-default"),
                    )
                    result: Any = {
                        "handle": tab.window_handle,
                        "tabId": tab.tab_id,
                        "cookieStoreId": tab.cookie_store_id,
                        "container": tab.container_name,
                        "url": driver.current_url,
                    }
                elif operation == "navigate":
                    timed_out = False
                    try:
                        driver.get(command["url"])
                    except TimeoutException:
                        timed_out = True
                    result = {
                        "url": driver.current_url,
                        "title": driver.title,
                        "timedOut": timed_out,
                    }
                elif operation == "click":
                    element = driver.find_element(
                        command.get("by", "css selector"), command["selector"]
                    )
                    timed_out = False
                    try:
                        element.click()
                    except TimeoutException:
                        timed_out = True
                    result = {
                        "url": driver.current_url,
                        "title": driver.title,
                        "timedOut": timed_out,
                    }
                elif operation == "type":
                    element = driver.find_element(
                        command.get("by", "css selector"), command["selector"]
                    )
                    if command.get("clear", True):
                        element.clear()
                    element.send_keys(command["text"])
                    result = {"value": element.get_attribute("value")}
                elif operation == "eval":
                    result = driver.execute_script(command["script"])
                elif operation == "find":
                    elements = driver.find_elements(
                        command.get("by", "css selector"), command["selector"]
                    )
                    result = [
                        {
                            "tag": element.tag_name,
                            "text": element.text,
                            "displayed": element.is_displayed(),
                            "enabled": element.is_enabled(),
                        }
                        for element in elements[: command.get("limit", 20)]
                    ]
                elif operation == "html":
                    result = driver.page_source
                elif operation == "screenshot":
                    if command.get("encoding") == "base64" or command.get("base64"):
                        result = _screenshot_b64(driver)
                    elif command.get("path"):
                        path = str(Path(command["path"]).expanduser().resolve())
                        driver.save_screenshot(path)
                        vp = _viewport(driver)
                        result = {
                            "path": path,
                            "width": vp.get("innerWidth"),
                            "height": vp.get("innerHeight"),
                            "dpr": vp.get("dpr", 1),
                        }
                    else:
                        result = _screenshot_b64(driver)
                elif operation == "viewport":
                    result = _viewport(driver)
                elif operation == "mouse_move":
                    _pointer_move(driver, command["x"], command["y"])
                    result = {"x": command["x"], "y": command["y"]}
                elif operation == "mouse_click":
                    _pointer_click(
                        driver,
                        command["x"],
                        command["y"],
                        button=command.get("button", "left"),
                        count=int(command.get("count", 1)),
                    )
                    result = {
                        "x": command["x"],
                        "y": command["y"],
                        "button": command.get("button", "left"),
                        "count": int(command.get("count", 1)),
                    }
                elif operation == "mouse_down":
                    if "x" in command and "y" in command:
                        _pointer_move(driver, command["x"], command["y"])
                    _pointer_down(driver, command.get("button", "left"))
                    result = {"button": command.get("button", "left")}
                elif operation == "mouse_up":
                    if "x" in command and "y" in command:
                        _pointer_move(driver, command["x"], command["y"])
                    _pointer_up(driver, command.get("button", "left"))
                    result = {"button": command.get("button", "left")}
                elif operation == "mouse_drag":
                    _pointer_drag(
                        driver,
                        command["x1"],
                        command["y1"],
                        command["x2"],
                        command["y2"],
                    )
                    result = {
                        "x1": command["x1"],
                        "y1": command["y1"],
                        "x2": command["x2"],
                        "y2": command["y2"],
                    }
                elif operation == "mouse_scroll":
                    _pointer_scroll(
                        driver,
                        command.get("x", 0),
                        command.get("y", 0),
                        command.get("deltaX", command.get("delta_x", 0)),
                        command.get("deltaY", command.get("delta_y", 0)),
                    )
                    result = {
                        "x": command.get("x", 0),
                        "y": command.get("y", 0),
                        "deltaX": command.get("deltaX", command.get("delta_x", 0)),
                        "deltaY": command.get("deltaY", command.get("delta_y", 0)),
                    }
                elif operation == "keys_type":
                    _keys_type(
                        driver,
                        command.get("text", command.get("content", "")),
                        delay_ms=float(command.get("delay_ms", command.get("delayMs", 0))),
                    )
                    result = {"length": len(command.get("text", command.get("content", "")))}
                elif operation == "keys_press":
                    _keys_press(driver, command["key"])
                    result = {"key": command["key"]}
                elif operation == "keys_chord":
                    _keys_chord(driver, list(command.get("keys", [])))
                    result = {"keys": command.get("keys", [])}
                elif operation == "go_back":
                    driver.back()
                    result = {"url": driver.current_url, "title": driver.title}
                elif operation == "status":
                    result = {
                        "url": driver.current_url,
                        "title": driver.title,
                        "handle": driver.current_window_handle,
                        "handles": driver.window_handles,
                        "profile": {
                            "name": browser.profile_name,
                            "path": str(browser.profile),
                        },
                        "viewport": _viewport(driver),
                    }
                elif operation == "switch":
                    driver.switch_to.window(command["handle"])
                    result = {"url": driver.current_url, "title": driver.title}
                elif operation == "containers":
                    result = browser.list_containers()
                elif operation == "ensure_container":
                    result = browser.ensure_container(
                        command["name"],
                        color=command.get("color", "blue"),
                        icon=command.get("icon", "fingerprint"),
                    )
                elif operation == "update_container":
                    result = browser.update_container(
                        command["container"],
                        name=command.get("name"),
                        color=command.get("color"),
                        icon=command.get("icon"),
                    )
                elif operation == "remove_container":
                    result = browser.remove_container(command["container"])
                elif operation == "tabs":
                    result = browser.list_tabs()
                elif operation == "tab_info":
                    result = browser.get_tab(command["tabId"])
                elif operation == "close_tab":
                    result = browser.close_tab(command["tabId"])
                elif operation == "extensions":
                    result = browser.list_extensions()
                elif operation == "install_extension":
                    result = {
                        "extensionId": browser.install_extension(
                            Path(command["path"]),
                            temporary=command.get("temporary", True),
                        )
                    }
                elif operation == "set_extension_enabled":
                    result = browser.set_extension_enabled(
                        command["extensionId"], command["enabled"]
                    )
                elif operation == "uninstall_extension":
                    browser.uninstall_extension(command["extensionId"])
                    result = {"extensionId": command["extensionId"]}
                elif operation == "proxy_list":
                    result = browser.list_container_proxy()
                elif operation == "proxy_assign":
                    result = browser.assign_container_proxy(
                        command["container"],
                        proxy_id=command.get("proxyId", command.get("proxy_id", "default")),
                        host=command["host"],
                        port=int(command["port"]),
                        proxy_type=command.get("type", "socks5"),
                        title=command.get("title", ""),
                        username=command.get("username"),
                        password=command.get("password"),
                        proxy_dns=command.get("proxyDns", command.get("proxy_dns", True)),
                        do_not_proxy_local=command.get(
                            "doNotProxyLocal",
                            command.get("do_not_proxy_local", True),
                        ),
                    )
                elif operation == "proxy_disable":
                    result = browser.disable_container_proxy(command["container"])
                elif operation == "list_accounts":
                    result = browser.list_accounts()
                elif operation == "get_account":
                    result = browser.get_account(command["account"])
                elif operation == "isolate_account":
                    proxy = command.get("proxy")
                    if proxy is None and command.get("host"):
                        proxy = {
                            "host": command.get("host"),
                            "port": command.get("port"),
                            "type": command.get("type", "socks5"),
                            "username": command.get("username"),
                            "password": command.get("password"),
                            "proxyId": command.get("proxyId", command.get("proxy_id")),
                            "title": command.get("title"),
                            "proxyDns": command.get("proxyDns", command.get("proxy_dns", True)),
                            "doNotProxyLocal": command.get(
                                "doNotProxyLocal",
                                command.get("do_not_proxy_local", True),
                            ),
                        }
                    result = browser.isolate_account(
                        command["account"],
                        container_name=command.get("containerName")
                        or command.get("container_name"),
                        color=command.get("color", "blue"),
                        icon=command.get("icon", "fingerprint"),
                        proxy=proxy,
                        open_url=command.get("openUrl") or command.get("url"),
                    )
                elif operation == "open_account":
                    tab = browser.open_account(
                        command["account"],
                        command["url"],
                        active=command.get("active", True),
                    )
                    result = {
                        "handle": tab.window_handle,
                        "tabId": tab.tab_id,
                        "cookieStoreId": tab.cookie_store_id,
                        "container": tab.container_name,
                        "url": driver.current_url,
                        "account": command["account"],
                    }
                elif operation == "clear_account_proxy":
                    result = browser.clear_account_proxy(command["account"])
                elif operation == "cf_status":
                    result = browser.inspect_cloudflare_challenge()
                elif operation == "cf_click":
                    result = browser.click_turnstile_checkbox(
                        method=command.get("method", "actions")
                    )
                elif operation in {"cf_solve", "solve_cloudflare", "solve_turnstile"}:
                    methods = command.get("methods")
                    if isinstance(methods, str):
                        methods = [part.strip() for part in methods.split(",") if part.strip()]
                    result = browser.solve_cloudflare_challenge(
                        timeout=float(command.get("timeout", 30)),
                        attempts=int(command.get("attempts", 3)),
                        wait_checkbox_timeout=float(
                            command.get(
                                "waitCheckboxTimeout",
                                command.get("wait_checkbox_timeout", 15),
                            )
                        ),
                        poll_interval=float(
                            command.get("pollInterval", command.get("poll_interval", 0.75))
                        ),
                        methods=methods,
                    )
                elif operation == "quit":
                    emit({"ok": True, "result": "closing"})
                    break
                else:
                    raise ValueError(f"Unknown operation: {operation}")
                emit({"ok": True, "result": result})
            except Exception as exc:
                emit({"ok": False, "error": f"{type(exc).__name__}: {exc}"})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
