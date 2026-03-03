/**
 * Lit Context definitions for passing data through the component tree.
 *
 * Uses @lit/context to provide reactive context values
 * without prop-drilling through intermediate components.
 */
import { createContext } from "@lit/context";
import { ESPHomeAPI } from "../api/index.js";
import type { ConfiguredDevice, AdoptableDevice } from "../api/types.js";
import type { LocalizeFunc } from "../common/localize.js";

/** Context for the ESPHome API client instance. */
export const apiContext = createContext<ESPHomeAPI>(Symbol("esphome-api"));

/** Context for the list of configured devices. */
export const devicesContext = createContext<ConfiguredDevice[]>(
  Symbol("esphome-devices")
);

/** Context for the device online/offline status map. */
export const deviceStatesContext = createContext<Record<string, boolean>>(
  Symbol("esphome-device-states")
);

/** Context for the list of importable/adoptable devices. */
export const importableDevicesContext = createContext<AdoptableDevice[]>(
  Symbol("esphome-importable-devices")
);

/** Context for the ESPHome version string. */
export const versionContext = createContext<string>(Symbol("esphome-version"));

/** Context for dark mode state. */
export const darkModeContext = createContext<boolean>(Symbol("esphome-dark-mode"));

/** Context for the localize function. */
export const localizeContext = createContext<LocalizeFunc>(
  Symbol("esphome-localize")
);
