# 步骤 1：使用官方的、轻量级的Node.js 18作为基础

FROM node:18-slim



# 步骤 2：设置工作目录

WORKDIR /app



# 步骤 3：安装运行camoufox(Firefox)所需的全部系统依赖

# Playwright 官方推荐的依赖库，确保浏览器能无头运行

RUN apt-get update && apt-get install -y \

    libasound2 \

    libatk-bridge2.0-0 \

    libatk1.0-0 \

    libatspi2.0-0 \

    libcups2 \

    libdbus-1-3 \

    libdrm2 \

    libgbm1 \

    libgtk-3-0 \

    libnspr4 \

    libnss3 \

    libx11-6 \

    libx11-xcb1 \

    libxcb1 \

    libxcomposite1 \

    libxdamage1 \

    libxext6 \

    libxfixes3 \

    libxrandr2 \

    libxss1 \

    libxtst6 \

    xvfb \

    && rm -rf /var/lib/apt/lists/*



# 步骤 4：复制 package.json 和 package-lock.json (如果存在)

# 将这一步提前，以便利用Docker的层缓存。只要依赖不变，就不需要重新安装。

COPY package*.json ./



# 步骤 5：安装 Node.js 依赖

RUN npm install --production



# 步骤 6：复制项目文件

COPY unified-server.js ./

COPY black-browser.js ./

COPY --chown=node:node camoufox-linux/ ./camoufox-linux/



# 为auth目录做准备，即使本地没有这个目录也不会报错

RUN mkdir ./auth && chown node:node ./auth

# 如果你有auth文件，可以用下面这行复制。如果用环境变量，则不需要。

# COPY --chown=node:node auth/ ./auth/



# 步骤 7：设置 camoufox 可执行权限

RUN chmod +x /app/camoufox-linux/camoufox



# 步骤 8：切换到非 root 用户 (node用户是node镜像自带的)

USER node



# 步骤 9：暴露服务端口

# 暴露HTTP服务端口7860 和 WebSocket端口9998

EXPOSE 7860

EXPOSE 9998



# 步骤 10：设置环境变量，指向容器内的浏览器路径

ENV CAMOUFOX_EXECUTABLE_PATH=/app/camoufox-linux/camoufox



# 步骤 11：定义容器启动命令

CMD ["node", "unified-server.js"]
