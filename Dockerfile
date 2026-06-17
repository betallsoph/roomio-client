# --- BƯỚC 1: XÂY DỰNG (BUILD) ---
    FROM node:20-alpine AS builder
    WORKDIR /app
    
    # Copy file cấu hình gói và cài đặt dependencies
    COPY package*.json ./
    RUN npm install
    
    # Copy toàn bộ code vào và build
    COPY . .
    RUN npm run build
    
    # --- BƯỚC 2: CHẠY (SERVE) ---
    FROM nginx:alpine
    
    # Xóa trang web mặc định của Nginx
    RUN rm -rf /usr/share/nginx/html/*
    
    # Copy kết quả từ Bước 1 sang Nginx
    # LƯU Ý: Nếu ông xài Svelte Vite thường thì nó là /app/dist
    # Nếu xài SvelteKit (adapter-static) thì nó là /app/build
    COPY --from=builder /app/build /usr/share/nginx/html
        
    # Cấu hình Nginx để ép nó đọc file index.html (Sửa lỗi F5 bị 404 Not Found)
    RUN echo 'server { listen 80; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
    
    EXPOSE 80
    CMD ["nginx", "-g", "daemon off;"]