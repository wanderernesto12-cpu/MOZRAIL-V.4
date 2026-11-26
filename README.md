# Mozrail Terminal

Aplicação para a Mozrail & Terminais, com base SQLite local e interface em português. O projecto inclui um modo de demonstração com dados fictícios. A imagem do terminal é ilustrativa. O logótipo usado é o disponibilizado pela Mozrail.

## Experimentar

Abre o HTML de demonstração no navegador e escolhe **Abrir demonstração**. Esta edição funciona num único navegador. Para experimentar a versão com servidor, extrai o projecto e usa Node.js 24 ou superior:

```text
node server.mjs --demo
```

O endereço local é `http://127.0.0.1:4173/`. O servidor de demonstração usa uma base em memória. Os registos desaparecem ao reiniciar.

## Melhorias visuais e de tempo

- O cabeçalho mostra a data e um relógio em tempo real no fuso `Africa/Maputo`, actualizado a cada segundo sem recarregar a página.
- O menu principal mantém-se horizontal, com deslocamento lateral em ecrãs pequenos.
- O dashboard recebeu um fundo vivo com gradientes, brilho e movimento suave, preservando cartões, tabelas e formulários legíveis. A animação respeita a preferência `prefers-reduced-motion`.
- Os timestamps dos registos operacionais continuam a ser guardados pelo servidor; o relógio do cabeçalho é apenas uma referência visual contínua.

## Publicar na conta da Mozrail

1. Cria um repositório novo no GitHub e coloca nele os ficheiros do projecto. Mantém o repositório e as contas de alojamento sob controlo da Mozrail.
2. Num serviço separado no Railway, aponta para esse repositório. O `Dockerfile` inicia a aplicação e `railway.toml` indica o endereço do controlo de estado.
3. Monta um volume persistente, por exemplo em `/data`, e define `DATA_DIR=/data` antes de usar a aplicação. Usa uma única réplica para SQLite.
4. Nas variáveis do serviço, define `ADMIN_EMAIL`, `ADMIN_PASSWORD` e, se necessário, `ADMIN_NAME`. Usa uma palavra-passe longa definida pela equipa de IT. Mantém estes valores fora do GitHub. O servidor só inicializa a primeira conta quando não existe um administrador.
5. Gera o endereço público do serviço e define `PUBLIC_URL` para o endereço HTTPS completo e `COOKIE_SECURE=1`. Confirma o login, a resposta `/health` e a persistência dos dados após uma nova publicação. A aplicação produção começa com os registos operacionais vazios.

O projecto pode ser executado noutro alojamento que suporte Node.js ou Docker e um volume persistente. Valida a disponibilidade e os limites do plano antes de importar fotografias ou registos reais.

## Operação e validação

- A **Portaria** regista entrada e saída com fotos, EIR e estadia. A entrada de contentor vazio usa um release validado, dentro da validade, que corresponda aos dados do contentor.
- **Parques** permite pesquisar, transferir entre parques e áreas, e consultar o historial. **Obras e serviços** cobre atribuição, execução e fecho. O catálogo inclui as 16 tarifas de Serviços.docx para 2026. A actividade diária por contentor guarda os serviços, as quantidades, os custos e o estado.
- Os documentos abrem no navegador e podem ser guardados como PDF pela opção de impressão. Os códigos QR apontam para a verificação pública do número, tipo e data de emissão. Os campos seguem os modelos enviados. Validar a impressão, a numeração e as assinaturas antes do uso oficial.
- O portal de cliente usa um link aleatório por contentor, revogável e com sete dias de validade. Quem possui o link tem acesso à consulta. O ecrã TV actualiza a cada 15 segundos enquanto estiver aberto.
- Os perfis disponíveis são administrador, portaria, supervisor, escritório e consulta. A matriz de autorizações por perfil está em `public/domain.js`. A configuração individual por acção, recuperação da palavra-passe e autenticação empresarial precisam de validação antes do arranque operacional.
- As pré-facturas apoiam a emissão no sistema certificado da empresa. Esta versão não emite factura fiscal, não guarda comprovativos de pagamento e não processa pagamentos.
- Antes de usar no terminal, confirmar as séries dos EIR e das guias, as tarifas, as permissões, os fluxos de aprovação e a política de cópias de segurança com o IT. As fotografias, utilizadores e operações estão no ficheiro SQLite. Usar um backup consistente do SQLite ou parar o serviço no momento de copiar o ficheiro para armazenamento externo e ensaiar o restauro. A rotina diária externa ainda não está configurada.

Testes de regras de operação: `node --test`. Para recriar a demonstração autónoma: `node create-demo.mjs destino.html`.
