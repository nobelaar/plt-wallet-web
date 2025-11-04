# PLT Wallet Web

Aplicación web construida con React, Vite y TypeScript que permite:

- Importar una wallet de Cosmos mediante mnemonic BIP39 o clave privada en formato hexadecimal.
- Enviar tokens desde la cuenta activa con validaciones, cálculo de comisiones y confirmación previa.
- Mostrar la información necesaria para recibir tokens (dirección completa, botón de copiado y QR).
- Guardar opcionalmente la información sensible cifrada con contraseña en el almacenamiento local.

## Configuración de red

Los parámetros de conexión se encuentran en [`src/config.ts`](src/config.ts):

- `RPC_ENDPOINT`: `https://rpc.cosmos.directory/cosmoshub`
- `CHAIN_ID`: `cosmoshub-4`
- `ADDRESS_PREFIX`: `cosmos`
- `BASE_DENOM`: `uatom`
- `DISPLAY_DENOM`: `ATOM`
- `DISPLAY_DECIMALS`: `6`
- `DEFAULT_GAS_PRICE`: `0.025uatom`
- `EXPLORER_BASE_URL`: `https://www.mintscan.io/cosmos/txs/`

Modificá estos valores para apuntar a otra red compatible si fuera necesario.

## Flujo de uso

1. Elegí importar por mnemonic o clave privada. La app valida el formato (BIP39 o hex de 64 caracteres).
2. Opcionalmente, activá la casilla “Guardar cifrado en este navegador” y proporcioná una contraseña mínima de 8 caracteres.
3. Al confirmar, se mostrará la dirección derivada, el balance disponible, accesos a “Enviar” y “Recibir” y un mensaje de éxito.
4. Para enviar, completá destino, monto y memo opcional. La app calcula la comisión mínima, muestra el total y solicita confirmación antes de firmar y transmitir.
5. La sección “Recibir” muestra la dirección, un QR descargable y recordatorios de confirmaciones on-chain.

## Persistencia cifrada

- El contenido sensible (mnemonic o clave privada) nunca se persiste en texto plano.
- Si se activa la persistencia, la información se cifra con AES-GCM utilizando una clave derivada vía PBKDF2 del password del usuario.
- La información cifrada se guarda bajo la clave `plt_wallet_encrypted` en `localStorage`.
- Para restaurar, la app solicita la misma contraseña y vuelve a crear el signer.

## Checklist de QA

- [ ] Importar un mnemonic válido deriva la dirección correcta y muestra balance.
- [ ] Importar una clave privada válida deriva la dirección correcta y muestra balance.
- [ ] Intentar importar datos inválidos arroja mensajes claros y no cambia el estado.
- [ ] Enviar un monto dentro del balance (menos fee) firma, transmite y muestra hash con link al explorer.
- [ ] Intentar enviar más del saldo disponible muestra “saldo insuficiente”.
- [ ] Tras guardar cifrado, recargar y desbloquear con contraseña correcta restaura signer y balance (y falla con contraseña incorrecta).
- [ ] Botón “copiar” y QR funcionan en la sección “Recibir”.

## Scripts disponibles

- `npm run dev`: inicia Vite en modo desarrollo.
- `npm run build`: ejecuta la compilación de producción.
- `npm run preview`: sirve la build de producción.
- `npm run lint`: corre ESLint sobre el proyecto.
