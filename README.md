# V9 Vision no celular

O app de celular do V9 Vision (27/10/2026). Site estático (GitHub Pages) que o aluno instala pelo navegador
("Instalar app" no Chrome, "Adicionar à Tela de Início" no Safari).

- O vídeo continua sendo feito no PC. O PC (V9 Vision, `celular.py`) manda a foto do andamento para a função `celular`
  do Supabase e busca os pedidos; este app lê a foto e deixa pedidos. O celular nunca fala direto com o PC.
- Ligar: no Vision, menu **App no celular** > **Mostrar o QR code** (código de 8 letras, 10 min, uso único).
- Avisos: Web Push (vídeo pronto, parou com erro, parou, MP4 pronto). No iPhone só com o app na Tela de Início.

Arquivos: `index.html` (telas e estilo), `app.js` (lógica), `sw.js` (cache da casca + avisos), `manifest.webmanifest`.
Nada aqui é segredo: o token de cada celular fica só no próprio celular (e o hash dele na nuvem).
