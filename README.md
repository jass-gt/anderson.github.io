# Finance OS (HTML + CSS + JavaScript)
1. Crie um projeto no Supabase e rode `supabase/migrations/001_init.sql` no SQL Editor.
2. Em Authentication > URL Configuration, adicione a URL onde o app roda (ex.: http://localhost:8080).
3. Preencha `js/config.js` com a URL e a chave **anon** (nunca a service_role).
4. Sirva a pasta: `npx serve .` ou `python3 -m http.server 8080` (módulos ES exigem http, não file://).
5. Testes das regras financeiras: `npm test`.
6. Rode também `supabase/migrations/002_extras.sql`.
7. Backup: botão "Baixar backup (JSON)" em Configurações; no Supabase, ative os backups automáticos do projeto (planos pagos incluem restauração por ponto no tempo).

## Abrir o site
`index.html`, `css/styles.css` e `js/*.js` são arquivos separados: mantenha a pasta inteira junta (abrir só o index.html não funciona).
Para o link de redefinição de senha funcionar, sirva por http(s) (ex.: `python3 -m http.server 8080`) e cadastre essa URL no Supabase.
