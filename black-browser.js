const Logger = {
  enabled: true,
  output(...messages) {
    if (!this.enabled) return;
    const timestamp =
      new Date().toLocaleTimeString("zh-CN", { hour12: false }) +
      "." +
      new Date().getMilliseconds().toString().padStart(3, "0");
    console.log(`[ProxyClient] ${timestamp}`, ...messages);
    const logElement = document.createElement("div");
    logElement.textContent = `[${timestamp}] ${messages.join(" ")}`;
    document.body.appendChild(logElement);
  },
};

class ConnectionManager extends EventTarget {
  // =================================================================
  // ===                 *** 请修改此行   *** ===
  constructor(endpoint = "ws://127.0.0.1:9998") {
    // =================================================================
    super();
    this.endpoint = endpoint;
    this.socket = null;
    this.isConnected = false;
    this.reconnectDelay = 5000;
    this.reconnectAttempts = 0;
  }

  async establish() {
    if (this.isConnected) return Promise.resolve();
    Logger.output("正在连接到服务器:", this.endpoint);
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.endpoint);
        this.socket.addEventListener("open", () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          Logger.output("✅ 连接成功!");
          this.dispatchEvent(new CustomEvent("connected"));
          resolve();
        });
        this.socket.addEventListener("close", () => {
          this.isConnected = false;
          Logger.output("❌ 连接已断开，准备重连...");
          this.dispatchEvent(new CustomEvent("disconnected"));
          this._scheduleReconnect();
        });
        this.socket.addEventListener("error", (error) => {
          Logger.output(" WebSocket 连接错误:", error);
          this.dispatchEvent(new CustomEvent("error", { detail: error }));
          if (!this.isConnected) reject(error);
        });
        this.socket.addEventListener("message", (event) => {
          this.dispatchEvent(
            new CustomEvent("message", { detail: event.data })
          );
        });
      } catch (e) {
        Logger.output(
          "WebSocket 初始化失败。请检查地址或浏览器安全策略。",
          e.message
        );
        reject(e);
      }
    });
  }

  transmit(data) {
    if (!this.isConnected || !this.socket) {
      Logger.output("无法发送数据：连接未建立");
      return false;
    }
    this.socket.send(JSON.stringify(data));
    return true;
  }

  _scheduleReconnect() {
    this.reconnectAttempts++;
    setTimeout(() => {
      Logger.output(`正在进行第 ${this.reconnectAttempts} 次重连尝试...`);
      this.establish().catch(() => {});
    }, this.reconnectDelay);
  }
}

class RequestProcessor {
  constructor() {
    this.activeOperations = new Map();
    this.targetDomain = "generativelanguage.googleapis.com";
    this.maxRetries = 3; // 最多尝试3次
    this.retryDelay = 2000; // 每次重试前等待2秒
  }

  execute(requestSpec, operationId) {
    const IDLE_TIMEOUT_DURATION = 600000;
    const abortController = new AbortController();
    this.activeOperations.set(operationId, abortController);

    let timeoutId = null;

    const startIdleTimeout = () => {
      return new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error(
            `超时: ${IDLE_TIMEOUT_DURATION / 1000} 秒内未收到任何数据`
          );
          abortController.abort();
          reject(error);
        }, IDLE_TIMEOUT_DURATION);
      });
    };

    const cancelTimeout = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        Logger.output("已收到数据块，超时限制已解除。");
      }
    };

    const attemptPromise = new Promise(async (resolve, reject) => {
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          Logger.output(
            `执行请求 (尝试 ${attempt}/${this.maxRetries}):`,
            requestSpec.method,
            requestSpec.path
          );

          const requestUrl = this._constructUrl(requestSpec);
          const requestConfig = this._buildRequestConfig(
            requestSpec,
            abortController.signal
          );

          const response = await fetch(requestUrl, requestConfig);

          if (!response.ok) {
            const errorBody = await response.text();
            const error = new Error(
              `Google API返回错误: ${response.status} ${response.statusText} ${errorBody}`
            );
            error.status = response.status;
            throw error;
          }

          resolve(response);
          return;
        } catch (error) {
          if (error.name === "AbortError") {
            reject(error);
            return;
          }
          const isNetworkError = error.message.includes("Failed to fetch");
          const isRetryableServerError =
            error.status && [500, 502, 503, 504].includes(error.status);
          if (
            (isNetworkError || isRetryableServerError) &&
            attempt < this.maxRetries
          ) {
            Logger.output(
              `❌ 请求尝试 #${attempt} 失败: ${error.message.substring(0, 200)}`
            );
            Logger.output(`将在 ${this.retryDelay / 1000}秒后重试...`);
            await new Promise((r) => setTimeout(r, this.retryDelay));
            continue;
          } else {
            reject(error);
            return;
          }
        }
      }
    });

    const responsePromise = Promise.race([attemptPromise, startIdleTimeout()]);

    return { responsePromise, cancelTimeout };
  }

  cancelAllOperations() {
    this.activeOperations.forEach((controller, id) => controller.abort());
    this.activeOperations.clear();
  }

  _constructUrl(requestSpec) {
    let pathSegment = requestSpec.path.startsWith("/")
      ? requestSpec.path.substring(1)
      : requestSpec.path;
    const queryParams = new URLSearchParams(requestSpec.query_params);
    if (requestSpec.streaming_mode === "fake") {
      Logger.output("假流式模式激活，正在修改请求...");
      if (pathSegment.includes(":streamGenerateContent")) {
        pathSegment = pathSegment.replace(
          ":streamGenerateContent",
          ":generateContent"
        );
        Logger.output(`API路径已修改为: ${pathSegment}`);
      }
      if (queryParams.has("alt") && queryParams.get("alt") === "sse") {
        queryParams.delete("alt");
        Logger.output('已移除 "alt=sse" 查询参数。');
      }
    }
    const queryString = queryParams.toString();
    return `https://${this.targetDomain}/${pathSegment}${
      queryString ? "?" + queryString : ""
    }`;
  }

  _generateRandomString(length) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++)
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  }

  _buildRequestConfig(requestSpec, signal) {
    const config = {
      method: requestSpec.method,
      headers: this._sanitizeHeaders(requestSpec.headers),
      signal,
    };
    if (
      ["POST", "PUT", "PATCH"].includes(requestSpec.method) &&
      requestSpec.body
    ) {
      try {
        const bodyObj = JSON.parse(requestSpec.body);
        if (bodyObj.contents?.[0]?.parts?.[0]?.text) {
          bodyObj.contents[bodyObj.contents.length - 1].parts[
            bodyObj.contents[body.contents.length - 1].parts.length - 1
          ].text += `\n\n[sig:${this._generateRandomString(5)}]`;
          Logger.output("已向提示文本末尾添加伪装字符串。");
        }
        config.body = JSON.stringify(bodyObj);
      } catch (e) {
        config.body = requestSpec.body;
      }
    }
    return config;
  }

  _sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    [
      "host",
      "connection",
      "content-length",
      "origin",
      "referer",
      "user-agent",
      "sec-fetch-mode",
      "sec-fetch-site",
      "sec-fetch-dest",
    ].forEach((h) => delete sanitized[h]);
    return sanitized;
  }
}

class ProxySystem extends EventTarget {
  constructor(websocketEndpoint) {
    super();
    this.connectionManager = new ConnectionManager(websocketEndpoint);
    this.requestProcessor = new RequestProcessor();
    this._setupEventHandlers();
  }

  async initialize() {
    Logger.output("系统初始化中...");
    try {
      await this.connectionManager.establish();
      Logger.output("系统初始化完成，等待服务器指令...");
      this.dispatchEvent(new CustomEvent("ready"));
    } catch (error) {
      Logger.output("系统初始化失败:", error.message);
      this.dispatchEvent(new CustomEvent("error", { detail: error }));
      throw error;
    }
  }

  _setupEventHandlers() {
    this.connectionManager.addEventListener("message", (e) =>
      this._handleIncomingMessage(e.detail)
    );
    this.connectionManager.addEventListener("disconnected", () =>
      this.requestProcessor.cancelAllOperations()
    );
  }

  async _handleIncomingMessage(messageData) {
    let requestSpec = {};
    try {
      requestSpec = JSON.parse(messageData);
      Logger.output(
        `收到请求: ${requestSpec.method} ${requestSpec.path} (模式: ${
          requestSpec.streaming_mode || "fake"
        })`
      );
      await this._processProxyRequest(requestSpec);
    } catch (error) {
      Logger.output("消息处理错误:", error.message);
      this._sendErrorResponse(error, requestSpec.request_id);
    }
  }

  // --- MODIFIED: _processProxyRequest 方法 ---
  async _processProxyRequest(requestSpec) {
    const operationId = requestSpec.request_id;
    const mode = requestSpec.streaming_mode || "fake";

    const { responsePromise, cancelTimeout } = this.requestProcessor.execute(
      requestSpec,
      operationId
    );

    try {
      const response = await responsePromise;
      this._transmitHeaders(response, operationId);

      const reader = response.body.getReader();
      const textDecoder = new TextDecoder();
      let timeoutCancelled = false;
      let fullBody = ""; // 用于假流式模式

      // [新增] 用于在流式模式下记录最终结束原因的变量
      let finalFinishReason = "UNKNOWN";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break; // 流已结束
        }

        if (!timeoutCancelled) {
          cancelTimeout();
          timeoutCancelled = true;
        }

        const chunk = textDecoder.decode(value, { stream: true });

        // [新增逻辑] 如果是真流式，实时解析每个数据块以捕获最后的 finishReason
        if (mode === "real") {
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const jsonData = JSON.parse(line.substring(5));
                if (
                  jsonData.candidates &&
                  jsonData.candidates[0] &&
                  jsonData.candidates[0].finishReason
                ) {
                  // 实时更新最后看到的结束原因
                  finalFinishReason = jsonData.candidates[0].finishReason;
                }
              } catch (e) {
                // 忽略JSON解析错误，因为有些心跳包可能不是标准JSON
              }
            }
          }
        }

        if (mode === "real") {
          // 真流式：直接转发数据块
          this._transmitChunk(chunk, operationId);
        } else {
          // 假流式：拼接成完整响应体
          fullBody += chunk;
        }
      }

      // --- [核心修改] 流读取完成后，根据模式增加详细的诊断日志 ---
      Logger.output("数据流已读取完成。");

      if (mode === "real") {
        // 真流式模式：基于流过程中记录的最后一个 finishReason 进行判断
        if (finalFinishReason === "STOP") {
          Logger.output(`✅ [诊断] 响应正常结束 (finishReason: STOP)`);
        } else {
          Logger.output(
            `🤔 [诊断] 响应可能被截断，结束原因为: ${finalFinishReason}`
          );
        }
      } else {
        // 假流式模式：解析完整的响应体来判断
        try {
          const parsedBody = JSON.parse(fullBody);
          // 尝试从响应体中获取 finishReason 和 safetyRatings
          const finishReason = parsedBody.candidates?.[0]?.finishReason;
          const safetyRatings = parsedBody.candidates?.[0]?.safetyRatings;

          if (finishReason === "STOP") {
            Logger.output(`✅ [诊断] 响应正常结束 (finishReason: STOP)`);
          } else {
            Logger.output(
              `🤔 [诊断] 响应可能被截断，结束原因为: ${finishReason || "未知"}`
            );
            if (safetyRatings) {
              Logger.output(
                `[诊断] 安全评级详情: ${JSON.stringify(safetyRatings)}`
              );
            }
          }
          // 将完整的响应体转发给服务器
          this._transmitChunk(fullBody, operationId);
        } catch (e) {
          Logger.output(`⚠️ [诊断] 响应体不是有效的JSON格式，无法分析原因。`);
          // 即使解析失败，也尝试转发原始响应体
          this._transmitChunk(fullBody, operationId);
        }
      }

      // 发送流结束信号
      this._transmitStreamEnd(operationId);
    } catch (error) {
      Logger.output(`❌ 请求处理失败: ${error.message}`);
      if (error.name !== "AbortError") {
        this._sendErrorResponse(error, operationId);
      }
    }
  }

  _transmitHeaders(response, operationId) {
    const headerMap = {};
    response.headers.forEach((v, k) => {
      headerMap[k] = v;
    });
    this.connectionManager.transmit({
      request_id: operationId,
      event_type: "response_headers",
      status: response.status,
      headers: headerMap,
    });
  }

  _transmitChunk(chunk, operationId) {
    if (!chunk) return;
    this.connectionManager.transmit({
      request_id: operationId,
      event_type: "chunk",
      data: chunk,
    });
  }

  _transmitStreamEnd(operationId) {
    this.connectionManager.transmit({
      request_id: operationId,
      event_type: "stream_close",
    });
    Logger.output("任务完成，已发送流结束信号");
  }

  _sendErrorResponse(error, operationId) {
    if (!operationId) return;
    this.connectionManager.transmit({
      request_id: operationId,
      event_type: "error",
      // 关键修改：优先使用error对象上的status，如果没有则默认为504
      status: error.status || 504,
      message: `代理端浏览器错误: ${error.message || "未知错误"}`,
    });
    Logger.output("已将错误信息发送回服务器");
  }
}

async function initializeProxySystem() {
  // 清理旧的日志
  document.body.innerHTML = "";
  const proxySystem = new ProxySystem();
  try {
    await proxySystem.initialize();
  } catch (error) {
    console.error("代理系统启动失败:", error);
    Logger.output("代理系统启动失败:", error.message);
  }
}

initializeProxySystem();
