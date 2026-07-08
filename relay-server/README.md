# Relay AppBarber

Servidor pequeno que roda na VPS com IP fixo (liberado no AppBarber) e repassa
chamadas da Edge Function `customer-chat`/`chatbot` do Supabase para a API do
AppBarber. Sem dependências externas — só precisa de Node.js.

## Deploy na VPS (Ubuntu)

1. Instalar Node.js 20:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. Copiar esta pasta para o servidor, por exemplo em `/opt/sir-alfred-relay`:
   ```bash
   sudo mkdir -p /opt/sir-alfred-relay
   # copie server.js, .env.example e sir-alfred-relay.service para lá
   ```

3. Criar o `.env` a partir do exemplo e preencher os valores:
   ```bash
   cd /opt/sir-alfred-relay
   cp .env.example .env
   nano .env   # preencher RELAY_SECRET, APPBARBER_BASE_URL, APPBARBER_API_KEY
   ```
   Gere o `RELAY_SECRET` com: `openssl rand -hex 32`

4. Instalar e iniciar o serviço com systemd:
   ```bash
   sudo cp sir-alfred-relay.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now sir-alfred-relay
   sudo systemctl status sir-alfred-relay
   ```

5. Testar localmente no servidor:
   ```bash
   curl http://localhost:8787/health
   # deve responder {"ok":true}
   ```

6. Abrir a porta no firewall (ajuste conforme o firewall usado, ex: `ufw`):
   ```bash
   sudo ufw allow 8787/tcp
   ```

## Depois de no ar

- `APPBARBER_RELAY_URL` na Edge Function do Supabase = `http://<IP-DA-VPS>:8787`
- `APPBARBER_RELAY_SECRET` na Edge Function do Supabase = o mesmo valor de `RELAY_SECRET` daqui

## HTTPS (recomendado quando tiver um domínio)

Por padrão o relay fala HTTP simples — funciona, mas o tráfego não é
criptografado (só protegido pelo `RELAY_SECRET`). Se em algum momento você
apontar um domínio/subdomínio para o IP da VPS, dá pra colocar o
[Caddy](https://caddyserver.com/) na frente pra ganhar HTTPS automático com
poucas linhas de configuração — é só avisar que eu ajudo a configurar.
