# Roomio Web (Frontend)

Giao diện người dùng cho hệ thống quản lý nhà trọ Roomio. Build thành **SPA tĩnh** (HTML/CSS/JS), serve bằng nginx, không cần Node runtime. Mọi dữ liệu gọi qua REST API của `roomio-api`.

## Phạm vi sản phẩm hiện tại

MVP đang theo hướng **landlord-first**: ưu tiên dashboard chủ trọ để quản lý tòa nhà, phòng, khách thuê, hợp đồng, hóa đơn, thu tiền, sự cố, nhân viên và tự động hóa vận hành.

Route `/tenant` hiện chỉ xem như prototype/Phase 2 cho khách thuê tự phục vụ. Không ưu tiên phát triển thêm tenant portal cho tới khi luồng chủ trọ ổn định.

## Công nghệ

- SvelteKit 2 (Svelte 5, runes) → `@sveltejs/adapter-static` (SPA, `ssr=false`)
- Tailwind CSS 4, Lucide Icons, svelte-sonner
- Vite 8

## Chạy local

Cần `roomio-api` chạy sẵn ở `http://localhost:3000` (Vite tự proxy `/api` sang đó).

```bash
npm install
npm run dev          # giao diện tại http://localhost:5173
```

Đổi địa chỉ backend khi dev qua biến `API_PROXY_TARGET` (xem `.env.example`).

## Lệnh

| Lệnh | Mô tả |
| --- | --- |
| `npm run dev` | Chạy dev (cổng 5173, proxy `/api` sang backend) |
| `npm run build` | Build SPA tĩnh ra thư mục `build/` |
| `npm run preview` | Xem trước bản build |
| `npm run check` | Kiểm tra type |
| `npm run lint` | Lint |

## Triển khai (server riêng, có thể share tài nguyên)

SPA tĩnh không cần Node runtime → gần như không ngốn CPU/RAM.

```bash
npm ci && npm run build      # ra thư mục build/ (tĩnh)
# copy build/ vào thư mục nginx, vd /var/www/roomio
```

nginx serve tĩnh + reverse-proxy `/api` sang server backend (cùng domain để cookie first-party):

```nginx
server {
  listen 80;
  server_name roomio.example.com;
  root /var/www/roomio;
  client_max_body_size 6m;          # khớp giới hạn upload ảnh 5MB

  location /api/ {
    proxy_pass http://<IP_SERVER_BACKEND>:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri /index.html;     # SPA fallback
  }
}
```

Thêm HTTPS bằng certbot — bắt buộc để cookie `secure` của backend hoạt động. `ORIGIN` bên backend phải khớp domain này.
