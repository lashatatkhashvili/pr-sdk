/**
 * Promofy SDK (Vanilla JS)
 * Includes product/type enums, auth transition, and error handling
 */
const PromofyProduct = Object.freeze({
  F2P: "f2p",
  CASINO: "casino",
});

const PromofyType = Object.freeze({
  LOBBY: "lobby",
  CASINO_GAMES: "casino_games",
  CASINO_COMPLETION: "casino_completion",
  CASINO_SHOP: "casino_shop",
  WIDGET: "widget",
  MISSIONS: "missions",
  PICKEM: "pickem",
  QUIZZ: "quiz",
  LEADERBOARD: "leaderboard",
  WHEEL: "wheel",
  MATRIX: "matrix",
  MYSTERY_BOX: "mystery_box",
  SCRATCH_GAME: "scratch_game",
  CASINO_LOYALTY: "casino_loyalty",
});

/**
 * Supported languages in the Promofy SDK
 */
const PromofyLanguage = Object.freeze({
  ENGLISH: "en", // English
  SPANISH: "es", // Spanish
  FRENCH: "fr", // French
  INDONESIAN: "id", // Indonesian
  GEORGIAN: "ka", // Georgian
  KHMER: "km", // Khmer
  MALAY: "ms", // Malay
  PORTUGUESE: "pt", // Portuguese
  RUSSIAN: "ru", // Russian
  THAI: "th", // Thai
  TAGALOG: "tl", // Tagalog
  VIETNAMESE: "vi", // Vietnamese
  CHINESE: "zh", // Chinese
});

const Promofy = (() => {
  let apiKey = null;
  let currentConfig = null;
  let iframeElement = null;
  let gatewayUrl = "";
  let defaultContainerId = "promofy-widget";

  // v1 Authentication state
  let globalAuthToken = null;
  let authVersion = "v0"; // Default to v0 for backward compatibility
  let widgetRegistry = new Map(); // Track multiple widget instances
  let baseWidgetUrl = ""; // Base URL for widget loading
  let widgetCounter = 0; // Atomic counter for unique IDs
  let isReloading = false; // Prevent concurrent reloads

  const ROUTE_MAP = {
    [PromofyProduct.F2P]: {
      [PromofyType.LOBBY]: "/f2p/lobby",
      [PromofyType.PICKEM]: "/f2p/game/pickem",
      [PromofyType.QUIZZ]: "/f2p/game/pickem",
    },
    [PromofyProduct.CASINO]: {
      [PromofyType.LOBBY]: "/lobby/casino",
      [PromofyType.CASINO_SHOP]: "/casino/shop",
      [PromofyType.MISSIONS]: "/casino/missions",
      [PromofyType.CASINO_GAMES]: "/casino/game",
      [PromofyType.CASINO_COMPLETION]: "/casino/completion",
      [PromofyType.LEADERBOARD]: "/casino/game",
      [PromofyType.WHEEL]: "/casino/game",
      [PromofyType.MATRIX]: "/casino/game",
      [PromofyType.MYSTERY_BOX]: "/casino/game",
      [PromofyType.SCRATCH_GAME]: "/casino/game",
      [PromofyType.CASINO_LOYALTY]: "/lobby/loyalty",
    },
  };

  // Set up event listeners
  window.addEventListener("message", (event) => {
    const { data } = event;

    if (data && !data.action) {
      return;
    }

    switch (data.action) {
      case "closeIframe":
        hideIframe();
        break;
    }
  });

  const hideIframe = () => {
    if (iframeElement) {
      iframeElement.style.display = "none";
      document.body.style.overflow = "";
    }
  };

  const buildIframe = (url, containerId, mini = false) => {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container element with id '${containerId}' not found`);
      return;
    }

    // Create iframe
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    iframe.style.display = "block";
    iframe.style.position = "absolute";
    iframe.style.top = "0";
    iframe.style.left = "0";

    // Create a wrapper div for proper sizing
    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";
    wrapper.style.width = "100%";
    wrapper.style.height = "100%";
    wrapper.style.minHeight = mini ? "660px" : "600px"; // Set minimum height based on mini parameter
    wrapper.style.overflow = "auto"; // Add scroll when content exceeds container
    wrapper.style.boxSizing = "border-box";

    // Add load event to set connected state
    iframe.addEventListener("load", () => {
      connected = true;
    });

    // Clear container and add wrapped iframe
    container.innerHTML = "";
    wrapper.appendChild(iframe);
    container.appendChild(wrapper);
    iframeElement = iframe;

    // Set up resize observer for responsive sizing
    setupResizeObserver(container, iframe);

    return iframe;
  };

  const setupResizeObserver = (container, iframe) => {
    // Check if ResizeObserver is supported
    if (typeof ResizeObserver === "undefined") {
      console.warn("ResizeObserver is not supported in this browser");
      // Fallback to window resize event
      window.addEventListener("resize", () => {
        adjustIframeSize(container, iframe);
      });
      return;
    }

    // Create ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        console.log(`ResizeObserver triggered: container ${width}x${height}px`);
        adjustIframeSize(container, iframe);
      }
    });

    // Start observing the container
    resizeObserver.observe(container);

    // Store observer for cleanup
    container._resizeObserver = resizeObserver;
  };

  const adjustIframeSize = (container, iframe) => {
    const containerRect = container.getBoundingClientRect();
    const wrapper = iframe.parentElement;

    if (wrapper) {
      // Find the widget config to check for mini parameter
      let mini = false;
      for (const [widgetId, widgetConfig] of widgetRegistry) {
        if (widgetConfig.iframe === iframe) {
          mini = widgetConfig.config.mini || false;
          break;
        }
      }

      // Get container's computed styles for accurate sizing
      const containerStyles = window.getComputedStyle(container);
      const containerPaddingTop = parseInt(containerStyles.paddingTop) || 0;
      const containerPaddingBottom =
        parseInt(containerStyles.paddingBottom) || 0;
      const containerPaddingLeft = parseInt(containerStyles.paddingLeft) || 0;
      const containerPaddingRight = parseInt(containerStyles.paddingRight) || 0;

      const minHeight = mini ? 660 : 600;
      const availableHeight = Math.max(
        containerRect.height - containerPaddingTop - containerPaddingBottom,
        minHeight,
      );
      const availableWidth = Math.max(
        containerRect.width - containerPaddingLeft - containerPaddingRight,
        300,
      );

      // Force wrapper to exact dimensions
      wrapper.style.width = `${availableWidth}px`;
      wrapper.style.height = `${availableHeight}px`;
      wrapper.style.maxWidth = `${availableWidth}px`;
      wrapper.style.maxHeight = `${availableHeight}px`;

      console.log(
        `Adjusting iframe wrapper: ${availableWidth}x${availableHeight}px (container: ${containerRect.width}x${containerRect.height}px)`,
      );

      // Notify iframe content about resize
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          {
            action: "resize",
            width: availableWidth,
            height: availableHeight,
          },
          "*",
        );
      }
    }
  };

  // v0 (Legacy) - HMAC authentication with POST request
  const getSignedIframeUrl = async (config) => {
    if (!apiKey) {
      throw new Error(
        "API key is required. Configure it using Promofy.configure({apiKey: 'YOUR_API_KEY'})",
      );
    }

    const { userToken, promoId, product, type, lng, path } = config;

    try {
      const response = await fetch(gatewayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          userToken,
          promoId,
          product,
          type,
          lng,
          path,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      return data.iframeUrl;
    } catch (error) {
      console.error("Failed to get signed iframe URL:", error);
      throw error;
    }
  };

  // v1 (New) - Direct URL construction with path-based routing
  const buildWidgetUrl = (config) => {
    if (!apiKey) {
      throw new Error(
        "API key is required. Configure it using Promofy.configure({apiKey: 'YOUR_API_KEY'})",
      );
    }

    if (!baseWidgetUrl) {
      throw new Error(
        "Base widget URL is required for v1 authentication. Configure it using Promofy.configure({baseWidgetUrl: 'YOUR_WIDGET_URL'})",
      );
    }

    const { promoId, product, type, lng, path, token, mini, params } = config;

    // Build URL with path from ROUTE_MAP
    let url;
    if (path) {
      // Construct URL: baseWidgetUrl + path
      url = new URL(path, baseWidgetUrl);
    } else {
      // Fallback to base URL if no path
      url = new URL(baseWidgetUrl);
    }

    // Add v1 authentication parameters
    url.searchParams.set("v", "1"); // Enable v1 authentication
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("lng", lng);

    if (promoId) {
      url.searchParams.set("promoId", promoId);
    }

    if (token) {
      url.searchParams.set("token", token);
    }

    // Add mini parameter if provided
    if (mini) {
      url.searchParams.set("mini", "true");
    }

    // Append arbitrary params object as query parameters (e.g., completion config)
    if (params && typeof params === "object") {
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (Array.isArray(value) || typeof value === "object") {
          url.searchParams.set(key, JSON.stringify(value));
        } else {
          url.searchParams.set(key, String(value));
        }
      });
    }

    return url.toString();
  };

  // New authenticate function for v1 token management
  const authenticate = async (token) => {
    // Handle logout when token is null
    if (token === null) {
      // Clear the global authentication token
      globalAuthToken = null;

      // Clear user authentication data from localStorage
      localStorage.removeItem("user");

      // Clear all widget-related data from localStorage
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // Remove any keys that might be related to widgets/auth tokens
        if (key && key === "user") {
          keysToRemove.push(key);
        }
      }

      // Remove the identified keys
      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
      });

      // Reload all active widgets to switch to guest mode
      await reloadAllWidgets();

      return { success: true, message: "Logged out successfully" };
    }

    if (!token) {
      throw new Error("Authentication token is required");
    }

    // Make authentication call to gateway
    try {
      const response = await fetch(`${gatewayUrl}/v1/auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          session: token,
        }),
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status}`);
      }

      const data = await response.json();

      // Store the token from auth proxy response
      globalAuthToken = data.token || data.session || data.authToken;

      // Reload all active widgets with the new token
      await reloadAllWidgets();

      return data;
    } catch (error) {
      console.error("Authentication error:", error);
      throw error;
    }
  };

  // Function to reload all active widgets when authentication changes
  const reloadAllWidgets = async () => {
    // Prevent concurrent reloads
    if (isReloading) {
      console.warn("Widget reload already in progress, skipping");
      return;
    }

    isReloading = true;
    const reloadPromises = [];

    try {
      // Create a snapshot of current widgets to avoid iteration issues
      const widgetSnapshot = new Map(widgetRegistry);

      if (widgetSnapshot.size === 0) {
        console.log("No widgets to reload");
        return;
      }

      for (const [widgetId, widgetConfig] of widgetSnapshot) {
        try {
          const container = document.getElementById(widgetConfig.containerId);

          // If no container, widget was destroyed, skip it
          if (!container) {
            console.log(
              `Widget ${widgetId} container not found, skipping reload`,
            );
            continue;
          }

          // If container exists but no iframe, we need to recreate the widget
          if (container && !widgetConfig.iframe) {
            console.log(
              `Recreating widget ${widgetId} after authentication change`,
            );

            // Update config with new auth state
            const updatedConfig = { ...widgetConfig.config };
            if (globalAuthToken) {
              updatedConfig.token = globalAuthToken;
              updatedConfig.userToken = globalAuthToken;
            } else {
              // Clear tokens for guest mode
              delete updatedConfig.token;
              delete updatedConfig.userToken;
            }

            // Remove old widget from registry before recreating
            widgetRegistry.delete(widgetId);

            // Recreate the widget with updated config
            const promise = init(updatedConfig)
              .then((result) => {
                console.log(`Widget ${widgetId} recreated:`, result);
              })
              .catch((error) => {
                console.error(`Failed to recreate widget ${widgetId}:`, error);
              });

            reloadPromises.push(promise);
            continue;
          }

          if (container && widgetConfig.iframe) {
            // Get the new URL with updated token
            let newUrl;
            if (authVersion === "v1") {
              const configWithToken = {
                ...widgetConfig.config,
                token: globalAuthToken,
              };
              newUrl = buildWidgetUrl(configWithToken);
            } else {
              // For v0, update userToken and get signed URL (mini not supported in v0)
              const configWithToken = {
                ...widgetConfig.config,
                userToken: globalAuthToken,
              };
              delete configWithToken.mini; // Remove mini parameter for v0
              newUrl = await getSignedIframeUrl(configWithToken);
            }

            // Update iframe source
            widgetConfig.iframe.src = newUrl;

            reloadPromises.push(
              new Promise((resolve) => {
                const onLoad = () => {
                  widgetConfig.iframe.removeEventListener("load", onLoad);
                  resolve();
                };
                widgetConfig.iframe.addEventListener("load", onLoad);
              }),
            );
          }
        } catch (error) {
          console.error(`Failed to reload widget ${widgetId}:`, error);
        }
      }

      await Promise.all(reloadPromises);
      console.log(`Reload completed for ${reloadPromises.length} widgets`);
    } finally {
      isReloading = false;
    }
  };

  const init = async ({
    userToken = null,
    promoId = null,
    product,
    type,
    lng,
    containerId = defaultContainerId,
    version = null, // Allow explicit version override
    token = null, // v1 authentication token
    mini = false, // Mini parameter for Casino widgets
    params = null, // Additional query parameters to append to URL
  }) => {
    if (!apiKey) {
      throw new Error(
        "API key is required. Configure it using Promofy.configure({apiKey: 'YOUR_API_KEY'})",
      );
    }

    if (!containerId) {
      throw new Error("containerId is required");
    }

    // Check if container exists and read promoId from data attributes
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element with id '${containerId}' not found`);
    }

    // Read promoId from container data attribute if not provided in params
    const containerPromoId =
      container.dataset.promoId || container.getAttribute("data-promo-id");
    const finalPromoId = promoId || containerPromoId;

    // Validate required parameters
    if (!product) {
      throw new Error("product is required");
    }

    if (!Object.values(PromofyProduct).includes(product)) {
      throw new Error(`Invalid product: ${product}`);
    }

    if (!type) {
      throw new Error("type is required");
    }

    if (!lng) {
      throw new Error("lng is required");
    }

    // Validate language
    const supportedLanguages = Object.values(PromofyLanguage);
    if (!supportedLanguages.includes(lng)) {
      console.warn(
        `Warning: '${lng}' is not in the list of supported languages. Supported languages are: ${supportedLanguages.join(", ")}`,
      );
    }

    const typeMap = ROUTE_MAP[product];
    if (!typeMap[type]) {
      throw new Error(`Invalid type '${type}' for product '${product}'`);
    }

    // Validate promoId for casino game types
    const casinoGameTypes = [
      PromofyType.CASINO_GAMES,
      PromofyType.LEADERBOARD,
      PromofyType.WHEEL,
      PromofyType.MATRIX,
      PromofyType.MYSTERY_BOX,
      PromofyType.SCRATCH_GAME,
    ];

    if (casinoGameTypes.includes(type) && !finalPromoId) {
      throw new Error(`promoId is required for ${type} type`);
    }

    // Determine authentication version
    const useVersion = version || authVersion;

    // mini parameter is only supported in v1
    if (mini && useVersion !== "v1") {
      throw new Error(
        `The 'mini' parameter is only supported with v1 authentication. Please set version: 'v1' or configure with Promofy.configure({version: 'v1'})`,
      );
    }

    // Determine authentication token
    let authToken = null;
    if (useVersion === "v1") {
      // For v1, use explicit token parameter or global auth token
      authToken = token || globalAuthToken;
    } else {
      // For v0, use userToken parameter
      authToken = userToken;
    }

    // Determine path based on product and type
    const path =
      typeof typeMap[type] === "function"
        ? typeMap[type](finalPromoId)
        : typeMap[type];

    // Store configuration for this widget instance
    const widgetConfig = {
      userToken: authToken,
      promoId: finalPromoId,
      product,
      type,
      lng,
      containerId,
      path,
      token: authToken, // Store for v1 usage
      mini, // Store mini parameter
      params, // Store additional params
    };

    // Generate unique widget ID with atomic counter
    const widgetId = `${containerId}_${Date.now()}_${++widgetCounter}`;

    try {
      let iframeUrl;

      if (useVersion === "v1") {
        // v1: Direct URL construction
        if (!baseWidgetUrl) {
          throw new Error(
            "Base widget URL is required for v1 authentication. Configure it using Promofy.configure({baseWidgetUrl: 'YOUR_WIDGET_URL'})",
          );
        }
        iframeUrl = buildWidgetUrl(widgetConfig);
      } else {
        // v0: HMAC authentication
        if (!gatewayUrl) {
          throw new Error(
            "Gateway URL is required for v0 authentication. Configure it using Promofy.configure({gatewayUrl: 'YOUR_GATEWAY_URL'})",
          );
        }
        iframeUrl = await getSignedIframeUrl(widgetConfig);
      }

      const iframe = buildIframe(iframeUrl, containerId, mini);

      // Register widget instance for multi-widget support (thread-safe)
      const widgetEntry = {
        config: widgetConfig,
        iframe: iframe,
        containerId: containerId,
        version: useVersion,
        timestamp: Date.now(),
      };

      // Ensure no race condition during registration
      if (!widgetRegistry.has(widgetId)) {
        widgetRegistry.set(widgetId, widgetEntry);
      } else {
        console.warn(
          `Widget ID ${widgetId} already exists, skipping registration`,
        );
      }

      // Update global state for backward compatibility
      currentConfig = widgetConfig;
      iframeElement = iframe;
      connected = true;

      return {
        success: true,
        widgetId: widgetId,
        version: useVersion,
      };
    } catch (error) {
      console.error("Failed to initialize Promofy:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  };

  const authorize = async (newUserToken) => {
    if (!currentConfig) {
      throw new Error("Promofy.init() must be called before authorize()");
    }

    // Update user token
    currentConfig.userToken = newUserToken;

    try {
      // Get new signed URL
      const iframeUrl = await getSignedIframeUrl(currentConfig);

      // Update iframe source
      if (iframeElement) {
        iframeElement.src = iframeUrl;
      } else {
        buildIframe(iframeUrl, currentConfig.containerId, currentConfig.mini);
      }

      return true;
    } catch (error) {
      console.error("Failed to authorize Promofy:", error);
      return false;
    }
  };

  /**
   * Configure the SDK with all necessary settings
   * @param {Object} config - Configuration options
   * @param {string} config.apiKey - Your brand's unique API key (required)
   * @param {string} config.gatewayUrl - URL for the authentication session endpoint (v0)
   * @param {string} config.baseWidgetUrl - Base URL for widget loading (v1)
   * @param {string} config.defaultContainerId - Default container ID for the iframe
   * @param {string} config.version - Authentication version ('v0' or 'v1')
   */
  const configure = (config = {}) => {
    if (config.apiKey) {
      if (!config.apiKey) {
        throw new Error("apiKey cannot be empty");
      }
      apiKey = config.apiKey;
    }

    if (config.gatewayUrl) {
      gatewayUrl = config.gatewayUrl;
    }

    if (config.baseWidgetUrl) {
      baseWidgetUrl = config.baseWidgetUrl;
    }

    if (config.defaultContainerId) {
      defaultContainerId = config.defaultContainerId;
    }

    if (config.version) {
      if (!["v0", "v1"].includes(config.version)) {
        throw new Error("Version must be 'v0' or 'v1'");
      }
      authVersion = config.version;
    }

    return {
      apiKey,
      gatewayUrl,
      baseWidgetUrl,
      defaultContainerId,
      version: authVersion,
    };
  };

  // For backward compatibility
  const setApiKey = (key) => {
    if (!key) {
      throw new Error("API key cannot be empty");
    }
    apiKey = key;
  };

  // For backward compatibility
  const updateConfig = (config = {}) => {
    if (config.backendUrl) {
      gatewayUrl = config.backendUrl;
    }

    if (config.defaultContainerId) {
      defaultContainerId = config.defaultContainerId;
    }
  };

  const resize = () => {
    if (iframeElement && currentConfig) {
      const container = document.getElementById(currentConfig.containerId);
      if (container) {
        adjustIframeSize(container, iframeElement);
      }
    }
  };

  const destroy = (widgetId = null) => {
    try {
      if (widgetId) {
        // Destroy specific widget
        const widgetConfig = widgetRegistry.get(widgetId);
        if (widgetConfig) {
          // Clean up resize observer
          const container = document.getElementById(widgetConfig.containerId);
          if (container && container._resizeObserver) {
            container._resizeObserver.disconnect();
            delete container._resizeObserver;
          }

          // Clean up iframe
          if (widgetConfig.iframe) {
            widgetConfig.iframe.remove();
          }

          // Remove from registry atomically
          const deleted = widgetRegistry.delete(widgetId);
          if (!deleted) {
            console.warn(`Widget ${widgetId} was not found in registry`);
          }

          // If this was the current config, reset it
          if (
            currentConfig &&
            currentConfig.containerId === widgetConfig.containerId
          ) {
            currentConfig = null;
            iframeElement = null;
            connected = false;
          }
        }
      } else {
        // Destroy all widgets - create snapshot first to avoid iteration issues
        const widgetSnapshot = new Map(widgetRegistry);

        for (const [id, widgetConfig] of widgetSnapshot) {
          // Clean up resize observer
          const container = document.getElementById(widgetConfig.containerId);
          if (container && container._resizeObserver) {
            container._resizeObserver.disconnect();
            delete container._resizeObserver;
          }

          // Clean up iframe
          if (widgetConfig.iframe) {
            widgetConfig.iframe.remove();
          }
        }

        // Clear registry and reset state atomically
        widgetRegistry.clear();
        connected = false;
        currentConfig = null;
        iframeElement = null;
        globalAuthToken = null;
      }
    } catch (error) {
      console.error("Error during widget destruction:", error);
    }
  };

  // Get information about active widgets
  const getActiveWidgets = () => {
    const widgets = [];
    for (const [id, widgetConfig] of widgetRegistry) {
      widgets.push({
        id: id,
        containerId: widgetConfig.containerId,
        version: widgetConfig.version,
        product: widgetConfig.config.product,
        type: widgetConfig.config.type,
      });
    }
    return widgets;
  };

  // Set global authentication version
  const setAuthVersion = (version) => {
    if (!["v0", "v1"].includes(version)) {
      throw new Error("Version must be 'v0' or 'v1'");
    }
    authVersion = version;
    return authVersion;
  };

  return {
    // Core functions
    init,
    authorize,
    configure,
    resize,
    destroy,

    // v1 Authentication functions
    authenticate,
    setAuthVersion,
    getActiveWidgets,

    // Keep these for backward compatibility
    setApiKey,
    updateConfig,

    // Constants
    PromofyProduct,
    PromofyType,
    PromofyLanguage,
  };
})();

// Export constants for convenience
Promofy.PromofyProduct = PromofyProduct;
Promofy.PromofyType = PromofyType;
Promofy.PromofyLanguage = PromofyLanguage;
