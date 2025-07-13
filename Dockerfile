FROM holyterra/build-server:0623

# 切换到user用户
USER user
WORKDIR /home/user
COPY package.json .
RUN npm install
RUN npx playwright install firefox
COPY ./black-browser.js /home/user/black-browser.js
COPY ./unified-server.js /home/user/unified-server.js
# 暴露端口
EXPOSE 7860

# 启动命令
CMD ["node", "unified-server.js"]