# Warp Web — Fase 1

React + TypeScript + Vite + Tailwind. Este workspace depende de `@warp/shared` e `@warp/ui`, incluídos no monorepo. Consulte o README da raiz para instalar e executar.

Defina `VITE_API_URL` no `.env` local e no ambiente do build. O valor é público. Nunca coloque senhas, tokens SMTP ou `DATABASE_URL` neste projeto.

Já existe configuração SPA `vercel.json`. No monorepo, execute o build a partir da raiz e publique `apps/web/dist`. A publicação e a exportação independente para `warp-web.zip` serão validadas na Fase 7. Não existe API pública conectada nesta etapa.
