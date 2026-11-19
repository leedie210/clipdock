# ClipDock

打开分享链接即可播放视频的轻量网页，配合 Reading Room 本地素材工具使用。

## 实际能力

- 网页内播放完整视频或片段，保留浏览器原生进度、音量与全屏控制。
- 分别复制预览页面和视频源地址。
- 显示存储服务提供的预计到期时间；已到期链接不自动重复加载。
- 提供自制合成演示，不包含个人上传素材。
- HTML、CSS、原生 JavaScript，无构建步骤、没有第三方统计脚本。

GitHub Pages 仅托管播放器。上传和临时存储由本地工具连接的存储服务完成，页面不能延长原文件的保存期限。获得链接的人可访问对应视频。

## 分享格式

`https://<用户名>.github.io/clipdock/#src=<编码后的视频源URL>&title=<标题>&expires=<ISO到期时间>`

参数存于 URL fragment。标题使用文本渲染，视频只允许不含登录凭据的 HTTPS URL。

本地工具应保存预览页 URL 与媒体 URL，复制分享时优先返回预览页。需要直接抓取媒体的机器人可使用源地址，网页可播放不等于所有机器人都能读取。

## 本地预览

运行 `python -m http.server 8000 --bind 127.0.0.1`，访问 `http://127.0.0.1:8000/`。

## GitHub Pages

将本目录的公开文件上传到 `clipdock` 仓库，在 Settings / Pages 选择从 main 分支根目录发布。不上传 `.local`、任何用户数据库、视频原件、上传记录、Cookie 或密钥。

合成演示 `demo.mp4` 和 `poster.jpg` 由项目生成，作为公开功能演示。

项目代码采用 GPL-3.0-only，与配套 Reading Room 保持一致。
