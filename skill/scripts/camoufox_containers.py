#!/usr/bin/env python3
"""Launch Camoufox and control tabs in real Firefox containers with Selenium."""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from camoufox import DefaultAddons
from camoufox.utils import launch_options
from selenium import webdriver
from selenium.common.exceptions import (
    NoSuchElementException,
    NoSuchFrameException,
    TimeoutException,
)
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service


EXTENSION_ID = "camoufox-containers@ailb.local"
CONTAINER_PROXY_ID = "contaner-proxy@bekh-ivanov.me"
# All dedicated profiles live under ~/.camoufox/profiles/<name>.
# The default profile is ~/.camoufox/profiles/default.
DEFAULT_PROFILE_NAME = "default"
PROFILES_ROOT = Path.home() / ".camoufox" / "profiles"
DEFAULT_PROFILE = PROFILES_ROOT / DEFAULT_PROFILE_NAME
DEFAULT_EXTENSION = Path(__file__).resolve().parent.parent / "extension"
DEFAULT_CONTAINER_PROXY_XPI = (
    Path(__file__).resolve().parent.parent / "addons" / "container-proxy.xpi"
)


class CamoufoxContainerError(RuntimeError):
    pass


def sanitize_profile_name(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        raise CamoufoxContainerError("Profile name must not be empty")
    if cleaned.lower() == "default":
        return DEFAULT_PROFILE_NAME
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", cleaned):
        raise CamoufoxContainerError(
            "Profile names must be 1-64 chars: letters, digits, . _ -"
        )
    return cleaned




def sanitize_account_name(name: str) -> str:
    cleaned = " ".join(name.strip().split())
    if not cleaned:
        raise CamoufoxContainerError("Account name must not be empty")
    if len(cleaned) > 80:
        raise CamoufoxContainerError("Account name must be 80 characters or fewer")
    return cleaned


def account_container_name(account: str) -> str:
    """Stable Firefox container name for an isolated account."""
    # Keep human-readable; Firefox container names are free text.
    return f"acct:{sanitize_account_name(account)}"


def proxy_id_for_account(account: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", sanitize_account_name(account).lower()).strip("-")
    if not slug:
        slug = "account"
    return f"account-{slug}"

def resolve_profile(
    *,
    profile: Path | str | None = None,
    profile_name: str | None = None,
) -> Path:
    """Resolve the Firefox profile directory to open.

    Priority:
    1. Explicit filesystem path via profile=
    2. Named profile via profile_name=
    3. Default profile (~/.camoufox/profiles/default)
    """
    if profile is not None and profile_name is not None:
        raise CamoufoxContainerError(
            "Pass either profile path or profile_name, not both"
        )
    if profile is not None:
        return Path(profile).expanduser().resolve()
    if profile_name is None or sanitize_profile_name(profile_name) == DEFAULT_PROFILE_NAME:
        return DEFAULT_PROFILE.expanduser().resolve()
    name = sanitize_profile_name(profile_name)
    return (PROFILES_ROOT / name).expanduser().resolve()


def list_profiles() -> list[dict[str, Any]]:
    root = PROFILES_ROOT.expanduser()
    root.mkdir(parents=True, exist_ok=True)
    names = set()
    if root.is_dir():
        for entry in root.iterdir():
            if entry.is_dir() and not entry.name.startswith("."):
                names.add(entry.name)
    names.add(DEFAULT_PROFILE_NAME)

    profiles: list[dict[str, Any]] = []
    for name in sorted(names, key=lambda n: (n != DEFAULT_PROFILE_NAME, n.lower())):
        path = (root / name).expanduser().resolve()
        profiles.append(
            {
                "name": name,
                "path": str(path),
                "exists": path.is_dir(),
                "isDefault": name == DEFAULT_PROFILE_NAME,
                "locked": (path / ".parentlock").exists(),
            }
        )
    return profiles


def create_profile(profile_name: str) -> dict[str, Any]:
    """Create a named dedicated profile directory if missing."""
    name = sanitize_profile_name(profile_name)
    path = resolve_profile(profile_name=name)
    path.mkdir(parents=True, exist_ok=True)
    marker = path / ".camoufox-profile.json"
    if not marker.is_file():
        marker.write_text(
            json.dumps(
                {
                    "name": name,
                    "isDefault": name == DEFAULT_PROFILE_NAME,
                    "createdAt": int(time.time()),
                },
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
    return {
        "name": name,
        "path": str(path),
        "exists": True,
        "isDefault": name == DEFAULT_PROFILE_NAME,
        "created": True,
    }




@dataclass(frozen=True)
class ContainerTab:
    window_handle: str
    tab_id: int
    cookie_store_id: str
    container_name: str


class CamoufoxContainers:
    def __init__(
        self,
        *,
        profile: Path | str | None = None,
        profile_name: str | None = None,
        extension: Path = DEFAULT_EXTENSION,
        geckodriver: Path | None = None,
        headless: bool = False,
        install_container_proxy: bool = True,
        timeout: float = 15.0,
        create_if_missing: bool = True,
    ) -> None:
        if profile is None and profile_name is None:
            profile_path = DEFAULT_PROFILE
            resolved_name = DEFAULT_PROFILE_NAME
        else:
            profile_path = resolve_profile(profile=profile, profile_name=profile_name)
            if profile_name is not None:
                resolved_name = sanitize_profile_name(profile_name)
            elif profile_path == DEFAULT_PROFILE.expanduser().resolve():
                resolved_name = DEFAULT_PROFILE_NAME
            else:
                resolved_name = profile_path.name
        self.profile_name = resolved_name
        self.profile = Path(profile_path).expanduser().resolve()
        self.create_if_missing = create_if_missing
        self.extension = extension.expanduser().resolve()
        self.geckodriver = geckodriver.expanduser().resolve() if geckodriver else None
        self.headless = headless
        self.install_container_proxy = install_container_proxy
        self.timeout = timeout
        self.driver: webdriver.Firefox | None = None
        self.bridge_handle: str | None = None
        self._addon_directory: tempfile.TemporaryDirectory[str] | None = None
        self._external_addon_directories: list[tempfile.TemporaryDirectory[str]] = []

    def __enter__(self) -> "CamoufoxContainers":
        if not (self.extension / "manifest.json").is_file():
            raise CamoufoxContainerError(
                f"Container bridge extension is missing: {self.extension}"
            )

        if self.create_if_missing:
            create_profile(self.profile_name)
        elif not self.profile.is_dir():
            raise CamoufoxContainerError(
                f"Profile does not exist: {self.profile}. "
                "Create it first with create_profile() or --create-profile."
            )
        self._addon_directory = tempfile.TemporaryDirectory(
            prefix="camoufox-container-addon-"
        )
        addon_path = Path(self._addon_directory.name) / "container-bridge.xpi"
        self._build_addon(addon_path)

        generated = launch_options(
            config={"allowAddonNewtab": True},
            exclude_addons=[DefaultAddons.UBO],
            headless=self.headless,
            os="linux",
        )
        options = Options()
        options.binary_location = str(generated["executable_path"])
        if self.headless:
            options.add_argument("-headless")
        options.add_argument("-profile")
        options.add_argument(str(self.profile))
        for name, value in generated["firefox_user_prefs"].items():
            options.set_preference(name, value)
        options.set_preference("privacy.userContext.enabled", True)
        options.set_preference("privacy.userContext.ui.enabled", True)

        service_kwargs: dict[str, Any] = {
            "env": {
                **os.environ,
                **{name: str(value) for name, value in generated["env"].items()},
            }
        }
        if self.geckodriver:
            service_kwargs["executable_path"] = str(self.geckodriver)

        try:
            self.driver = webdriver.Firefox(
                options=options, service=Service(**service_kwargs)
            )
            self.driver.set_script_timeout(self.timeout)
            self.driver.set_page_load_timeout(min(self.timeout, 5.0))
            installed_id = self.driver.install_addon(str(addon_path), temporary=True)
            if installed_id != EXTENSION_ID:
                raise CamoufoxContainerError(
                    f"Unexpected bridge extension ID: {installed_id}"
                )
            if self.install_container_proxy:
                if not DEFAULT_CONTAINER_PROXY_XPI.is_file():
                    raise CamoufoxContainerError(
                        "Container Proxy is missing. Run scripts/bootstrap.sh"
                    )
                container_proxy_id = self.driver.install_addon(
                    str(DEFAULT_CONTAINER_PROXY_XPI), temporary=True
                )
                if container_proxy_id != CONTAINER_PROXY_ID:
                    raise CamoufoxContainerError(
                        f"Unexpected Container Proxy ID: {container_proxy_id}"
                    )
            internal_uuid = self._load_internal_uuid()
            bridge_url = f"moz-extension://{internal_uuid}/bridge.html"
            try:
                self.driver.get(bridge_url)
            except TimeoutException:
                pass
            if self.driver.current_url != bridge_url:
                raise CamoufoxContainerError(
                    f"Could not open the container bridge: {self.driver.current_url}"
                )
            if self.driver.execute_script("return typeof browser") != "object":
                raise CamoufoxContainerError(
                    "Firefox WebExtension APIs are unavailable in the bridge page"
                )
            self.bridge_handle = self.driver.current_window_handle
            return self
        except Exception:
            self.__exit__(None, None, None)
            raise

    def __exit__(self, *args: Any) -> None:
        if self.driver is not None:
            self.driver.quit()
        if self._addon_directory is not None:
            self._addon_directory.cleanup()
        for directory in self._external_addon_directories:
            directory.cleanup()
        self.driver = None
        self.bridge_handle = None
        self._addon_directory = None
        self._external_addon_directories = []

    def _require_driver(self) -> webdriver.Firefox:
        if self.driver is None:
            raise CamoufoxContainerError("CamoufoxContainers is not running")
        return self.driver

    def _build_addon(self, destination: Path) -> None:
        with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(self.extension.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(self.extension))

    def _load_extension_uuid(self, extension_id: str) -> str:
        pattern = re.compile(
            r'^user_pref\("extensions\.webextensions\.uuids",\s*(.+)\);$'
        )
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            pref_file = self.profile / "prefs.js"
            if pref_file.is_file():
                for line in pref_file.read_text(
                    encoding="utf-8", errors="replace"
                ).splitlines():
                    match = pattern.match(line.strip())
                    if not match:
                        continue
                    try:
                        mapping = json.loads(json.loads(match.group(1)))
                    except json.JSONDecodeError as exc:
                        raise CamoufoxContainerError(
                            f"Could not parse extension UUIDs in {pref_file}"
                        ) from exc
                    if internal_uuid := mapping.get(extension_id):
                        return str(internal_uuid)
            time.sleep(0.1)
        raise CamoufoxContainerError(
            f"Firefox did not register {extension_id} within {self.timeout} seconds"
        )

    def _load_internal_uuid(self) -> str:
        return self._load_extension_uuid(EXTENSION_ID)

    def _bridge_call(self, operation: str, payload: dict[str, Any]) -> Any:
        driver = self._require_driver()
        if self.bridge_handle is None:
            raise CamoufoxContainerError("Container bridge is not available")
        driver.switch_to.window(self.bridge_handle)
        script = r"""
const operation = arguments[0];
const payload = arguments[1];
const done = arguments[arguments.length - 1];

function publicContainer(container) {
  return {
    cookieStoreId: container.cookieStoreId,
    name: container.name,
    color: container.color,
    colorCode: container.colorCode,
    icon: container.icon,
    iconUrl: container.iconUrl,
  };
}

async function resolveContainer(selector) {
  if (selector === "firefox-default" || selector.toLocaleLowerCase() === "default") {
    return {cookieStoreId: "firefox-default", name: "Default"};
  }
  const containers = await browser.contextualIdentities.query({});
  const byId = containers.find(item => item.cookieStoreId === selector);
  if (byId) return publicContainer(byId);
  const folded = selector.toLocaleLowerCase();
  const byName = containers.filter(
    item => item.name.toLocaleLowerCase() === folded
  );
  if (byName.length === 1) return publicContainer(byName[0]);
  if (byName.length > 1) throw new Error(`Ambiguous container name: ${selector}`);
  throw new Error(`Container not found: ${selector}`);
}

async function execute() {
  if (operation === "listContainers") {
    const containers = await browser.contextualIdentities.query({});
    return containers.map(publicContainer);
  }
  if (operation === "ensureContainer") {
    const containers = await browser.contextualIdentities.query({});
    const folded = payload.name.toLocaleLowerCase();
    const matches = containers.filter(
      item => item.name.toLocaleLowerCase() === folded
    );
    if (matches.length > 1) {
      throw new Error(`Ambiguous container name: ${payload.name}`);
    }
    if (matches.length === 1) return publicContainer(matches[0]);
    const created = await browser.contextualIdentities.create({
      name: payload.name,
      color: payload.color,
      icon: payload.icon,
    });
    return publicContainer(created);
  }
  if (operation === "updateContainer") {
    const container = await resolveContainer(payload.container);
    if (container.cookieStoreId === "firefox-default") {
      throw new Error("The default cookie store cannot be updated");
    }
    const updated = await browser.contextualIdentities.update(
      container.cookieStoreId,
      payload.changes
    );
    return publicContainer(updated);
  }
  if (operation === "removeContainer") {
    const container = await resolveContainer(payload.container);
    if (container.cookieStoreId === "firefox-default") {
      throw new Error("The default cookie store cannot be removed");
    }
    await browser.contextualIdentities.remove(container.cookieStoreId);
    return container;
  }
  if (operation === "openTab") {
    const container = await resolveContainer(payload.container);
    const tab = await browser.tabs.create({
      active: payload.active !== false,
      cookieStoreId: container.cookieStoreId,
      url: payload.url,
    });
    return {
      container,
      tab: {
        id: tab.id,
        cookieStoreId: tab.cookieStoreId,
        windowId: tab.windowId,
      },
    };
  }
  if (operation === "getTab") {
    const tab = await browser.tabs.get(payload.tabId);
    return {
      id: tab.id,
      cookieStoreId: tab.cookieStoreId,
      title: tab.title,
      url: tab.url,
      windowId: tab.windowId,
    };
  }
  if (operation === "listTabs") {
    const tabs = await browser.tabs.query({});
    return tabs.map(tab => ({
      id: tab.id,
      active: tab.active,
      cookieStoreId: tab.cookieStoreId,
      title: tab.title,
      url: tab.url,
      windowId: tab.windowId,
    }));
  }
  if (operation === "closeTab") {
    await browser.tabs.remove(payload.tabId);
    return {id: payload.tabId};
  }
  if (operation === "listExtensions") {
    const items = await browser.management.getAll();
    return items.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      version: item.version,
      enabled: item.enabled,
      mayDisable: item.mayDisable,
      installType: item.installType,
    }));
  }
  if (operation === "setExtensionEnabled") {
    await browser.management.setEnabled(payload.extensionId, payload.enabled);
    return browser.management.get(payload.extensionId);
  }
  throw new Error(`Unknown operation: ${operation}`);
}

execute().then(
  value => done({ok: true, value}),
  error => done({ok: false, error: String(error && error.stack || error)})
);
"""
        result = driver.execute_async_script(script, operation, payload)
        if not isinstance(result, dict) or not result.get("ok"):
            error = result.get("error", "Unknown bridge error") if isinstance(
                result, dict
            ) else repr(result)
            raise CamoufoxContainerError(error)
        return result.get("value")

    def list_containers(self) -> list[dict[str, Any]]:
        return self._bridge_call("listContainers", {})

    def ensure_container(
        self,
        name: str,
        *,
        color: str = "blue",
        icon: str = "fingerprint",
    ) -> dict[str, Any]:
        return self._bridge_call(
            "ensureContainer", {"name": name, "color": color, "icon": icon}
        )

    def update_container(
        self,
        container: str,
        *,
        name: str | None = None,
        color: str | None = None,
        icon: str | None = None,
    ) -> dict[str, Any]:
        changes = {
            key: value
            for key, value in {"name": name, "color": color, "icon": icon}.items()
            if value is not None
        }
        if not changes:
            raise CamoufoxContainerError("No container changes were provided")
        return self._bridge_call(
            "updateContainer", {"container": container, "changes": changes}
        )

    def remove_container(self, container: str) -> dict[str, Any]:
        return self._bridge_call("removeContainer", {"container": container})

    def open_tab(
        self,
        url: str,
        *,
        container: str = "firefox-default",
        active: bool = True,
    ) -> ContainerTab:
        driver = self._require_driver()
        existing_handles = set(driver.window_handles)
        result = self._bridge_call(
            "openTab", {"url": url, "container": container, "active": active}
        )
        deadline = time.monotonic() + self.timeout
        new_handles: set[str] = set()
        while time.monotonic() < deadline:
            new_handles = set(driver.window_handles) - existing_handles
            if new_handles:
                break
            time.sleep(0.1)
        if len(new_handles) != 1:
            raise CamoufoxContainerError(
                f"Expected one new tab handle, found {len(new_handles)}"
            )

        handle = new_handles.pop()
        driver.switch_to.window(handle)
        tab = result["tab"]
        resolved = result["container"]
        return ContainerTab(
            window_handle=handle,
            tab_id=tab["id"],
            cookie_store_id=tab["cookieStoreId"],
            container_name=resolved["name"],
        )

    def switch_to(self, tab: ContainerTab) -> None:
        self._require_driver().switch_to.window(tab.window_handle)

    def get_tab(self, tab_id: int) -> dict[str, Any]:
        return self._bridge_call("getTab", {"tabId": tab_id})

    def list_tabs(self) -> list[dict[str, Any]]:
        return self._bridge_call("listTabs", {})

    def close_tab(self, tab_id: int) -> dict[str, Any]:
        return self._bridge_call("closeTab", {"tabId": tab_id})

    def list_extensions(self) -> list[dict[str, Any]]:
        return self._bridge_call("listExtensions", {})

    def set_extension_enabled(
        self, extension_id: str, enabled: bool
    ) -> dict[str, Any]:
        if extension_id == EXTENSION_ID and not enabled:
            raise CamoufoxContainerError("Cannot disable the active control bridge")
        matches = [
            item for item in self.list_extensions() if item["id"] == extension_id
        ]
        if not matches:
            raise CamoufoxContainerError(f"Extension not found: {extension_id}")
        if matches[0]["type"] != "theme":
            raise CamoufoxContainerError(
                "Firefox management.setEnabled supports themes only"
            )
        return self._bridge_call(
            "setExtensionEnabled",
            {"extensionId": extension_id, "enabled": enabled},
        )

    def install_extension(self, path: Path, *, temporary: bool = True) -> str:
        source = path.expanduser().resolve()
        if source.is_dir():
            if not (source / "manifest.json").is_file():
                raise CamoufoxContainerError(
                    f"Extension directory has no manifest.json: {source}"
                )
            directory = tempfile.TemporaryDirectory(prefix="camoufox-addon-")
            self._external_addon_directories.append(directory)
            packaged = Path(directory.name) / "extension.xpi"
            with zipfile.ZipFile(packaged, "w", zipfile.ZIP_DEFLATED) as archive:
                for item in sorted(source.rglob("*")):
                    if item.is_file():
                        archive.write(item, item.relative_to(source))
            source = packaged
        if not source.is_file():
            raise CamoufoxContainerError(f"Extension does not exist: {source}")
        return self._require_driver().install_addon(str(source), temporary=temporary)


    def _run_container_proxy_script(
        self, operation: str, payload: dict[str, Any]
    ) -> Any:
        """Execute privileged Container Proxy storage APIs from its options page."""
        driver = self._require_driver()
        previous = driver.current_window_handle
        uuid = self._load_extension_uuid(CONTAINER_PROXY_ID)
        options_url = f"moz-extension://{uuid}/options/options.html"
        driver.switch_to.new_window("tab")
        handle = driver.current_window_handle
        try:
            try:
                driver.get(options_url)
            except TimeoutException:
                pass
            if not driver.current_url.startswith(f"moz-extension://{uuid}/"):
                raise CamoufoxContainerError(
                    f"Could not open Container Proxy options: {driver.current_url}"
                )
            if driver.execute_script("return typeof browser") != "object":
                raise CamoufoxContainerError(
                    "WebExtension APIs unavailable on Container Proxy options page"
                )
            script = r"""
const operation = arguments[0];
const payload = arguments[1];
const done = arguments[arguments.length - 1];

function allContainers() {
  return browser.contextualIdentities.query({}).then(items => [
    ...items,
    {cookieStoreId: "firefox-default", name: "Default"},
    {cookieStoreId: "firefox-private", name: "Private Browsing"},
  ]);
}

function selectContainer(containers, selector) {
  const exactId = containers.find(c => c.cookieStoreId === selector);
  if (exactId) return exactId;
  const folded = selector.toLocaleLowerCase();
  const byName = containers.filter(c => c.name.toLocaleLowerCase() === folded);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw new Error(`Ambiguous container name: ${selector}`);
  throw new Error(`Container not found: ${selector}`);
}

function publicProxy(proxy) {
  return {
    id: proxy.id,
    title: proxy.title,
    type: proxy.type,
    host: proxy.host,
    port: proxy.port,
    doNotProxyLocal: proxy.doNotProxyLocal,
    proxyDNS: proxy.proxyDNS,
    hasUsername: Boolean(proxy.username),
    hasPassword: Boolean(proxy.password),
  };
}

async function execute() {
  const containers = await allContainers();
  const stored = await browser.storage.local.get(["proxies", "relations"]);
  const proxies = Array.isArray(stored.proxies) ? stored.proxies : [];
  const relations = stored.relations && typeof stored.relations === "object"
    ? stored.relations
    : {};

  if (operation === "list") {
    return {
      containers: containers.map(c => ({
        cookieStoreId: c.cookieStoreId,
        name: c.name,
      })),
      proxies: proxies.map(publicProxy),
      relations,
    };
  }

  const container = selectContainer(containers, payload.container);

  if (operation === "assign") {
    const index = proxies.findIndex(p => p.id === payload.proxy.id);
    if (index === -1) proxies.push(payload.proxy);
    else proxies[index] = payload.proxy;
    relations[container.cookieStoreId] = [payload.proxy.id];
    await browser.storage.local.set({proxies, relations});
    return {
      container: {name: container.name, cookieStoreId: container.cookieStoreId},
      proxy: publicProxy(payload.proxy),
    };
  }

  if (operation === "disable") {
    delete relations[container.cookieStoreId];
    await browser.storage.local.set({relations});
    return {
      container: {name: container.name, cookieStoreId: container.cookieStoreId},
    };
  }

  throw new Error(`Unknown Container Proxy operation: ${operation}`);
}

execute().then(
  value => done({ok: true, value}),
  error => done({ok: false, error: String(error && error.stack || error)})
);
"""
            result = driver.execute_async_script(script, operation, payload)
            if not isinstance(result, dict) or not result.get("ok"):
                error = (
                    result.get("error", "Unknown Container Proxy error")
                    if isinstance(result, dict)
                    else repr(result)
                )
                raise CamoufoxContainerError(error)
            return result.get("value")
        finally:
            try:
                driver.close()
            except Exception:
                pass
            try:
                driver.switch_to.window(previous)
            except Exception:
                if self.bridge_handle in driver.window_handles:
                    driver.switch_to.window(self.bridge_handle)

    def list_container_proxy(self) -> dict[str, Any]:
        return self._run_container_proxy_script("list", {})

    def assign_container_proxy(
        self,
        container: str,
        *,
        proxy_id: str,
        host: str,
        port: int,
        proxy_type: str = "socks",
        title: str = "",
        username: str | None = None,
        password: str | None = None,
        proxy_dns: bool = True,
        do_not_proxy_local: bool = True,
    ) -> dict[str, Any]:
        type_map = {
            "http": "http",
            "https": "https",
            "socks": "socks",
            "socks5": "socks",
            "socks4": "socks4",
        }
        stored_type = type_map.get(proxy_type.lower())
        if not stored_type:
            raise CamoufoxContainerError(
                "proxy_type must be http, https, socks, socks5, or socks4"
            )
        proxy: dict[str, Any] = {
            "id": proxy_id,
            "title": title or proxy_id,
            "type": stored_type,
            "host": host,
            "port": int(port),
            "doNotProxyLocal": do_not_proxy_local,
        }
        if username is not None:
            proxy["username"] = username
        if password is not None:
            proxy["password"] = password
        if stored_type in {"socks", "socks4"}:
            proxy["proxyDNS"] = proxy_dns
        return self._run_container_proxy_script(
            "assign", {"container": container, "proxy": proxy}
        )

    def disable_container_proxy(self, container: str) -> dict[str, Any]:
        return self._run_container_proxy_script("disable", {"container": container})


    def inspect_cloudflare_challenge(self) -> dict[str, Any]:
        """Inspect whether the active document looks like a Cloudflare challenge."""
        driver = self._require_driver()
        info = driver.execute_script(
            """
return {
  url: location.href,
  title: document.title || '',
  text: (document.body && document.body.innerText || '').slice(0, 500),
  frames: window.frames.length,
  tokenLen: ((document.querySelector('input[name="cf-turnstile-response"]') || {}).value || '').length,
  hasClearance: document.cookie.includes('cf_clearance'),
  hasTurnstileInput: !!document.querySelector('input[name="cf-turnstile-response"]'),
  hasChallengeScript: !!document.querySelector('script[src*="/cdn-cgi/challenge-platform/"]'),
  hasTurnstileScript: !!document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]'),
};
"""
        )
        if not isinstance(info, dict):
            info = {}
        title = str(info.get("title") or "").lower()
        text = str(info.get("text") or "").lower()
        detected = any(
            [
                "just a moment" in title,
                "checking your browser" in title,
                "performing security verification" in text,
                "verify you are human" in text,
                "verifying you are human" in text,
                bool(info.get("hasChallengeScript")),
                bool(info.get("hasTurnstileInput"))
                and int(info.get("frames") or 0) > 0
                and int(info.get("tokenLen") or 0) == 0,
            ]
        )
        challenge_type = "none"
        if detected:
            if info.get("hasTurnstileInput") or info.get("hasTurnstileScript"):
                challenge_type = "turnstile"
            else:
                challenge_type = "interstitial"
        return {
            **info,
            "detected": detected,
            "challengeType": challenge_type,
        }

    def _find_turnstile_checkbox(self):
        """Locate the closed-shadow Turnstile checkbox in a challenge iframe.

        Cloudflare Turnstile/interstitial widgets live in a cross-origin iframe
        whose interactive checkbox is inside a closed shadow root on <body>.
        Ordinary CSS queries on the parent page see neither the iframe element
        nor the checkbox; Selenium can still:
          1. switch_to.frame(index)
          2. body = find_element(By.CSS_SELECTOR, 'body')
          3. shadow = body.shadow_root
          4. checkbox = shadow.find_element(By.CSS_SELECTOR, 'input[type=checkbox]')
        """
        driver = self._require_driver()
        driver.switch_to.default_content()
        frame_count = int(
            driver.execute_script("return window.frames.length") or 0
        )
        last_error: Exception | None = None
        for index in range(max(frame_count, 1)):
            try:
                driver.switch_to.default_content()
                driver.switch_to.frame(index)
                body = driver.find_element(By.CSS_SELECTOR, "body")
                try:
                    shadow = body.shadow_root
                except Exception as exc:  # noqa: BLE001 - Selenium shadow errors vary
                    last_error = exc
                    continue
                checkbox = shadow.find_element(
                    By.CSS_SELECTOR, "input[type='checkbox']"
                )
                label = None
                try:
                    label = shadow.find_element(By.CSS_SELECTOR, "label")
                except NoSuchElementException:
                    label = None
                return {
                    "frameIndex": index,
                    "checkbox": checkbox,
                    "label": label,
                    "shadowHost": body,
                }
            except (NoSuchFrameException, NoSuchElementException) as exc:
                last_error = exc
                continue
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                continue
        driver.switch_to.default_content()
        raise CamoufoxContainerError(
            "Cloudflare Turnstile checkbox not found in closed shadow roots"
            + (f" ({type(last_error).__name__}: {last_error})" if last_error else "")
        )

    def click_turnstile_checkbox(
        self,
        *,
        method: str = "actions",
    ) -> dict[str, Any]:
        """Click the Cloudflare Turnstile/interstitial checkbox once.

        method:
          - actions: element-origin ActionChains move + click (preferred)
          - element: plain WebElement.click()
          - label: click the surrounding label when present
        """
        driver = self._require_driver()
        found = self._find_turnstile_checkbox()
        checkbox = found["checkbox"]
        label = found["label"]
        method_name = method.lower().strip()
        if method_name == "actions":
            actions = ActionChains(driver)
            actions.move_to_element_with_offset(checkbox, 2, 3)
            actions.pause(0.05)
            actions.click()
            actions.perform()
            clicked = "actions"
        elif method_name == "label" and label is not None:
            label.click()
            clicked = "label"
        elif method_name in {"element", "checkbox", "label"}:
            # label falls back to checkbox when no label exists
            checkbox.click()
            clicked = "element"
        else:
            driver.switch_to.default_content()
            raise CamoufoxContainerError(
                "method must be one of: actions, element, label"
            )
        driver.switch_to.default_content()
        return {
            "clicked": clicked,
            "frameIndex": found["frameIndex"],
            "status": self.inspect_cloudflare_challenge(),
        }

    def solve_cloudflare_challenge(
        self,
        *,
        timeout: float = 30.0,
        attempts: int = 3,
        wait_checkbox_timeout: float = 15.0,
        poll_interval: float = 0.75,
        methods: list[str] | None = None,
    ) -> dict[str, Any]:
        """Solve an interactive Cloudflare interstitial/Turnstile challenge.

        Evidence-backed procedure for this Selenium/Camoufox controller:
        1. Detect challenge page markers (title/text/token/script).
        2. Switch into the challenge iframe by index (iframe node is often not
           present in the open parent DOM).
        3. Open the closed shadow root on the iframe document body.
        4. Click input[type=checkbox] with an element-origin mouse action.
        5. Immediately return to the parent document and poll until the
           challenge disappears / page navigates / cf_clearance appears.

        Notes from real runs and Camoufox issue #150:
        - Parent-page CSS and execute_script cannot see the checkbox.
        - Random page-coordinate clicks usually miss the closed-shadow widget.
        - A successful click commonly transitions text to
          "Verifying you are human..." before the challenge completes.
        - If the challenge recycles, re-locate the checkbox and click again
          promptly; do not spend a long time probing between clicks.
        - Playwright-only workarounds such as route.fulfill or disable_coop are
          not required for this Selenium closed-shadow path, but can still help
          Playwright Camoufox sessions.
        """
        driver = self._require_driver()
        methods = methods or ["actions", "element", "label"]
        started = time.monotonic()
        deadline = started + max(timeout, 1.0)
        history: list[dict[str, Any]] = []
        initial = self.inspect_cloudflare_challenge()
        if not initial.get("detected"):
            return {
                "solved": True,
                "alreadyPassed": True,
                "attempts": 0,
                "elapsed": 0.0,
                "status": initial,
                "history": history,
            }

        attempt = 0
        while attempt < max(attempts, 1) and time.monotonic() < deadline:
            attempt += 1
            method = methods[(attempt - 1) % len(methods)]
            checkbox_deadline = min(
                deadline, time.monotonic() + max(wait_checkbox_timeout, 1.0)
            )
            found_checkbox = False
            while time.monotonic() < checkbox_deadline:
                try:
                    click_result = self.click_turnstile_checkbox(method=method)
                    found_checkbox = True
                    history.append(
                        {
                            "attempt": attempt,
                            "method": method,
                            "event": "clicked",
                            "result": click_result,
                        }
                    )
                    break
                except CamoufoxContainerError as exc:
                    history.append(
                        {
                            "attempt": attempt,
                            "method": method,
                            "event": "checkbox-wait",
                            "error": str(exc),
                        }
                    )
                    time.sleep(min(poll_interval, 0.5))
            if not found_checkbox:
                continue

            # Poll parent document after click.
            while time.monotonic() < deadline:
                status = self.inspect_cloudflare_challenge()
                history.append(
                    {
                        "attempt": attempt,
                        "event": "poll",
                        "status": {
                            "url": status.get("url"),
                            "title": status.get("title"),
                            "detected": status.get("detected"),
                            "tokenLen": status.get("tokenLen"),
                            "hasClearance": status.get("hasClearance"),
                            "text": str(status.get("text") or "")[:160],
                        },
                    }
                )
                if not status.get("detected"):
                    return {
                        "solved": True,
                        "alreadyPassed": False,
                        "attempts": attempt,
                        "elapsed": round(time.monotonic() - started, 3),
                        "status": status,
                        "history": history[-20:],
                    }
                text = str(status.get("text") or "").lower()
                # Still verifying; keep polling this attempt.
                if "verifying you are human" in text or "verification successful" in text:
                    time.sleep(poll_interval)
                    continue
                # Challenge recycled back to checkbox prompt; try another click.
                if "performing security verification" in text or "verify you are human" in text:
                    break
                time.sleep(poll_interval)

        final = self.inspect_cloudflare_challenge()
        return {
            "solved": not bool(final.get("detected")),
            "alreadyPassed": False,
            "attempts": attempt,
            "elapsed": round(time.monotonic() - started, 3),
            "status": final,
            "history": history[-20:],
        }


    def uninstall_extension(self, extension_id: str) -> None:
        if extension_id == EXTENSION_ID:
            raise CamoufoxContainerError("Cannot uninstall the active control bridge")
        self._require_driver().uninstall_addon(extension_id)


    def _accounts_file(self) -> Path:
        return self.profile / ".camoufox-accounts.json"

    def _load_accounts(self) -> dict[str, Any]:
        path = self._accounts_file()
        if not path.is_file():
            return {"version": 1, "accounts": {}}
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise CamoufoxContainerError(
                f"Could not parse account registry {path}"
            ) from exc
        if not isinstance(data, dict):
            return {"version": 1, "accounts": {}}
        accounts = data.get("accounts")
        if not isinstance(accounts, dict):
            accounts = {}
        return {"version": 1, "accounts": accounts}

    def _save_accounts(self, data: dict[str, Any]) -> None:
        path = self._accounts_file()
        path.write_text(
            json.dumps(data, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    def list_accounts(self) -> list[dict[str, Any]]:
        """List account isolation records for the active browser profile."""
        data = self._load_accounts()
        accounts = []
        for key in sorted(data["accounts"], key=str.lower):
            item = dict(data["accounts"][key])
            item.setdefault("account", key)
            accounts.append(item)
        return accounts

    def get_account(self, account: str) -> dict[str, Any]:
        name = sanitize_account_name(account)
        data = self._load_accounts()
        item = data["accounts"].get(name)
        if not item:
            raise CamoufoxContainerError(f"Account not found: {name}")
        result = dict(item)
        result.setdefault("account", name)
        return result

    def isolate_account(
        self,
        account: str,
        *,
        container_name: str | None = None,
        color: str = "blue",
        icon: str = "fingerprint",
        proxy: dict[str, Any] | None = None,
        open_url: str | None = None,
    ) -> dict[str, Any]:
        """Isolate an account into its own Firefox container.

        Always creates/ensures a dedicated container for the account. If proxy
        details are provided, assigns that proxy only to the account container
        via Container Proxy. Optionally opens a URL in that container.
        """
        account_name = sanitize_account_name(account)
        cname = container_name.strip() if container_name else account_container_name(account_name)
        if not cname:
            raise CamoufoxContainerError("Container name must not be empty")

        container = self.ensure_container(cname, color=color, icon=icon)
        result: dict[str, Any] = {
            "account": account_name,
            "container": container,
            "proxy": None,
            "tab": None,
        }

        if proxy:
            required = ["host", "port"]
            missing = [key for key in required if key not in proxy or proxy[key] in (None, "")]
            if missing:
                raise CamoufoxContainerError(
                    f"Proxy is missing required fields: {', '.join(missing)}"
                )
            proxy_id = str(proxy.get("proxyId") or proxy.get("proxy_id") or proxy_id_for_account(account_name))
            assignment = self.assign_container_proxy(
                container["cookieStoreId"],
                proxy_id=proxy_id,
                host=str(proxy["host"]),
                port=int(proxy["port"]),
                proxy_type=str(proxy.get("type") or proxy.get("proxy_type") or "socks5"),
                title=str(proxy.get("title") or f"{account_name} proxy"),
                username=proxy.get("username"),
                password=proxy.get("password"),
                proxy_dns=bool(proxy.get("proxyDns", proxy.get("proxy_dns", True))),
                do_not_proxy_local=bool(
                    proxy.get("doNotProxyLocal", proxy.get("do_not_proxy_local", True))
                ),
            )
            result["proxy"] = assignment.get("proxy")
            result["proxyAssignment"] = assignment

        if open_url:
            tab = self.open_tab(open_url, container=container["cookieStoreId"], active=True)
            result["tab"] = {
                "windowHandle": tab.window_handle,
                "tabId": tab.tab_id,
                "cookieStoreId": tab.cookie_store_id,
                "container": tab.container_name,
            }

        # Persist account registry in the profile (no secrets).
        registry = self._load_accounts()
        record = {
            "account": account_name,
            "containerName": container["name"],
            "cookieStoreId": container["cookieStoreId"],
            "color": container.get("color"),
            "icon": container.get("icon"),
            "proxyId": (result["proxy"] or {}).get("id"),
            "proxyHost": (result["proxy"] or {}).get("host"),
            "proxyPort": (result["proxy"] or {}).get("port"),
            "proxyType": (result["proxy"] or {}).get("type"),
            "updatedAt": int(time.time()),
        }
        existing = registry["accounts"].get(account_name) or {}
        if "createdAt" in existing:
            record["createdAt"] = existing["createdAt"]
        else:
            record["createdAt"] = record["updatedAt"]
        registry["accounts"][account_name] = record
        self._save_accounts(registry)
        result["registry"] = record
        return result

    def open_account(
        self,
        account: str,
        url: str,
        *,
        active: bool = True,
    ) -> ContainerTab:
        """Open a URL in an already-isolated account container."""
        record = self.get_account(account)
        return self.open_tab(
            url,
            container=record.get("cookieStoreId") or record.get("containerName"),
            active=active,
        )

    def clear_account_proxy(self, account: str) -> dict[str, Any]:
        """Disable Container Proxy for an isolated account container only."""
        record = self.get_account(account)
        disabled = self.disable_container_proxy(
            record.get("cookieStoreId") or record.get("containerName")
        )
        registry = self._load_accounts()
        item = registry["accounts"].get(sanitize_account_name(account), {})
        for key in ("proxyId", "proxyHost", "proxyPort", "proxyType"):
            item.pop(key, None)
        item["updatedAt"] = int(time.time())
        registry["accounts"][sanitize_account_name(account)] = item
        self._save_accounts(registry)
        return {"account": sanitize_account_name(account), "disabled": disabled, "registry": item}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Control Firefox container tabs in Clover Labs Camoufox"
    )
    parser.add_argument(
        "--profile",
        type=Path,
        help="Explicit Firefox profile directory path",
    )
    parser.add_argument(
        "--profile-name",
        help="Named dedicated profile under ~/.camoufox/profiles (default: default)",
    )
    parser.add_argument("--geckodriver", type=Path)
    parser.add_argument("--headless", action="store_true")
    parser.add_argument(
        "--create-if-missing",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Create the selected named profile directory if it does not exist",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="List Firefox contextual identities")
    sub.add_parser("list-profiles", help="List available dedicated browser profiles")

    create_profile_parser = sub.add_parser(
        "create-profile", help="Create a named dedicated browser profile"
    )
    create_profile_parser.add_argument("name")

    create = sub.add_parser("create", help="Create a container if it is missing")
    create.add_argument("name")
    create.add_argument("--color", default="blue")
    create.add_argument("--icon", default="fingerprint")

    open_parser = sub.add_parser("open", help="Open a URL in a selected container")
    open_parser.add_argument("url")
    open_parser.add_argument("--container", default="firefox-default")
    open_parser.add_argument("--wait", action="store_true")

    sub.add_parser("list-accounts", help="List isolated accounts in the selected profile")

    isolate = sub.add_parser(
        "isolate-account",
        help="Create/ensure an account container and optionally assign a proxy only to it",
    )
    isolate.add_argument("account")
    isolate.add_argument("--container-name")
    isolate.add_argument("--color", default="blue")
    isolate.add_argument("--icon", default="fingerprint")
    isolate.add_argument("--open-url")
    isolate.add_argument("--proxy-host")
    isolate.add_argument("--proxy-port", type=int)
    isolate.add_argument("--proxy-type", default="socks5")
    isolate.add_argument("--proxy-username")
    isolate.add_argument("--proxy-password")
    isolate.add_argument("--proxy-id")
    isolate.add_argument("--proxy-title")
    isolate.add_argument("--no-proxy-dns", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "list-profiles":
        print(json.dumps(list_profiles(), indent=2, sort_keys=True))
        return 0
    if args.command == "create-profile":
        print(json.dumps(create_profile(args.name), indent=2, sort_keys=True))
        return 0

    with CamoufoxContainers(
        profile=args.profile,
        profile_name=args.profile_name,
        geckodriver=args.geckodriver,
        headless=args.headless,
        create_if_missing=args.create_if_missing,
    ) as browser:
        if args.command == "list":
            value: Any = {
                "profile": {
                    "name": browser.profile_name,
                    "path": str(browser.profile),
                },
                "containers": browser.list_containers(),
            }
        elif args.command == "list-accounts":
            value = browser.list_accounts()
        elif args.command == "isolate-account":
            proxy = None
            if args.proxy_host or args.proxy_port is not None:
                if not args.proxy_host or args.proxy_port is None:
                    raise CamoufoxContainerError(
                        "Both --proxy-host and --proxy-port are required for proxy assignment"
                    )
                proxy = {
                    "host": args.proxy_host,
                    "port": args.proxy_port,
                    "type": args.proxy_type,
                    "username": args.proxy_username,
                    "password": args.proxy_password,
                    "proxyId": args.proxy_id,
                    "title": args.proxy_title,
                    "proxyDns": not args.no_proxy_dns,
                }
            value = browser.isolate_account(
                args.account,
                container_name=args.container_name,
                color=args.color,
                icon=args.icon,
                proxy=proxy,
                open_url=args.open_url,
            )
        elif args.command == "create":
            value = browser.ensure_container(
                args.name, color=args.color, icon=args.icon
            )
        elif args.command == "open":
            tab = browser.open_tab(args.url, container=args.container)
            driver = browser._require_driver()
            value = {
                "profile": {
                    "name": browser.profile_name,
                    "path": str(browser.profile),
                },
                "container": tab.container_name,
                "cookieStoreId": tab.cookie_store_id,
                "tabId": tab.tab_id,
                "url": driver.current_url,
                "windowHandle": tab.window_handle,
            }
        else:
            raise AssertionError(args.command)

        print(json.dumps(value, indent=2, sort_keys=True))
        if args.command == "open" and args.wait:
            input("Press Enter to close Camoufox... ")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
