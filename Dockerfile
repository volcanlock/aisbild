# Dockerfile
FROM node:18-slim
WORKDIR /app

# 安装基础工具和浏览器依赖
RUN apt-get update && apt-get install -y \
    curl \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcups2 \
    libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-6 \
    libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
    libxrandr2 libxss1 libxtst6 xvfb \
    && rm -rf /var/lib/apt/lists/*

# 接收从外部传入的下载链接
ARG CAMOUFOX_URL

# 下载并解压 Camoufox
RUN curl -sSL ${CAMOUFOX_URL} -o camoufox-linux.tar.gz && \
    tar -xzf camoufox-linux.tar.gz && \
    rm camoufox-linux.tar.gz

# 复制 package.json 等
COPY package*.json ./
# 安装 Node.js 依赖
RUN npm install --production
# 复制项目文件
COPY unified-server.js ./
COPY black-browser.js ./

# 准备 auth 目录
RUN mkdir ./auth && chown node:node ./auth
# 设置 camoufox 可执行权限
RUN chmod +x /app/camoufox-linux/camoufox

# 切换到非 root 用户
USER node
# 暴露服务端口
EXPOSE 7860
EXPOSE 9998
# 设置环境变量
ENV CAMOUFOX_EXECUTABLE_PATH=/app/camoufox-linux/camoufox
# 定义容器启动命令
CMD ["node", "unified-server.js"]
