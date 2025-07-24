# 步骤 1：使用微软官方的 Playwright 镜像作为基础
# [最终修复] 更新到当前官方文档推荐的、有效的稳定版镜像
FROM mcr.microsoft.com/playwright:v1.45.0-jammy

# 步骤 2：切换到镜像内置的非root用户，更安全
USER pwuser
WORKDIR /home/pwuser/app

# 步骤 3：复制 package.json 并安装 Node.js 依赖
# 使用 --chown=pwuser:pwuser 确保文件所有权正确
COPY --chown=pwuser:pwuser package.json .
RUN npm install

# 步骤 4：使用 Playwright 的工具只安装我们需要的 Firefox 浏览器
RUN npx playwright install firefox

# 步骤 5：复制您项目中的所有其他文件
COPY --chown=pwuser:pwuser . .

# 步骤 6：暴露您的服务端口
EXPOSE 7860

# 步骤 7：设置启动命令
CMD ["node", "unified-server.js"]
