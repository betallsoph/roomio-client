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
        
    # Copy file cấu hình mẫu cho Nginx để hỗ trợ envsubst proxy API
    COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
    
    EXPOSE 80
    CMD ["nginx", "-g", "daemon off;"]