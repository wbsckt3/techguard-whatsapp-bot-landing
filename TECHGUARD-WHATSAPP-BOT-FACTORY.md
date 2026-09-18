# TechGuard WhatsApp IA Bot Factory — entrega y modelo

## Cierre del plan

Plan TechGuard WhatsApp IA Bot Factory cerrado: los 6 to-dos quedan.

### Entregado
- **Tenant + backend:** `p2l-techguard-whatsapp-bot`, modelos, servicio, rutas, webhook Meta GET verify + POST stub, jobs → `bot-config.json` + `RUNBOOK.md`.
- **Front:** login white-label, dashboard subtenant (empresas, ePayco, secretos, analytics) y dashboard empresa (marca, skills, flujos, MCP, WA, runbook).
- **Rutas:** `/login/techguard-whatsapp-bot` → `/techguard-whatsapp-bot-dashboard` y `/techguard-whatsapp-bot/company/:companyId`.
- **Landing:** `docs/gh-pages-techguard-whatsapp-bot/` con SEO + JSON-LD + CNAME `www.techguard.pro`, publicada en `wbsckt3/techguard-whatsapp-bot-landing`.

### URLs
| Qué | URL |
|-----|-----|
| Landing | https://www.techguard.pro/ (también https://wbsckt3.github.io/techguard-whatsapp-bot-landing/) |
| Login | https://www.refactorii.com/p2l-tenant/login/techguard-whatsapp-bot |

**Nota:** el DNS de `www.techguard.pro` debe apuntar a GitHub Pages (CNAME ya configurado en el repo). El front de producción hay que desplegarlo para que el login/dashboard queden vivos en refactorii.com.

---

## Explicame como funciona, si creo una empresa se crea una bd para esa empresa ? etc

**No:** al crear una empresa **no** se crea una base de datos nueva. Todo TechGuard vive en **una sola BD Mongo** del subtenant.

### Capas (n-1-n)

| Capa | Qué es | BD |
|------|--------|-----|
| **P2L tenant** | Cupos/capacidad de la plataforma | Config BAAS |
| **Subtenant TechGuard** | Dashboard de factories (`p2l-techguard-whatsapp-bot`) | **Una** Mongo: `p2l_techguard_whatsapp_bot` |
| **Empresa** (ej. Hato Viejo) | Un bot / cliente | **Documentos** dentro de esa misma BD |

### Qué pasa al “Crear empresa”

Se insertan filas en la BD compartida:

1. Documento en `wa_bot_companies` (nombre, admin, plan, marca, skills, flujos…)
2. Documento en `whatsapp_bot_connections` ligado por `companyId` (verify token vacío de claves Meta)
3. Te devuelve una vez el `companyKey` en claro (luego solo queda el hash)

No hay `mongoDb` por empresa. Hato Viejo y otra empresa son dos docs en la misma colección.

### Dónde va cada cosa

- **Agent-tech por empresa** (GitHub PAT, Groq, Dropbox): en `wa_bot_companies.agentTech` — **un bot = una config**. Meta en `whatsapp_bot_connections` por `companyId`.
- Lo único compartido del subtenant: URL de webhook + ePayco (env).
- **Claves Meta** (App Secret, token): cifradas en `whatsapp_bot_connections` **por empresa**.
- **Jobs / RUNBOOK**: en `bot_agent_jobs` + campos `lastRunbookMd` / `lastBotConfigJson` en la empresa.
- **Webhook:** una URL común  
  `https://www.refactorii.com/p2l-tenant/api/p2l-techguard-whatsapp-bot/wa/webhook`
  (Nginx solo proxea bajo `/p2l-tenant/api/`; la landing debe usar esa misma base)  
  (en fase 2 se enruta por Phone Number ID / companyId; hoy es stub).

### Analogía

Como Tuki/Unidades: el **tenant** tiene su Mongo; las **companies** son registros multi-tenant lógicos, no clusters Mongo separados.

Si más adelante quisieras aislamiento fuerte (BD o cluster por cliente enterprise), habría que diseñarlo aparte; **fase 1 no lo hace**.

---

## Flujo operativo (quién hace qué)

**1. Tú en TechGuard (subtenant)**  
Entras a `/login/techguard-whatsapp-bot` → dashboard factories.

Ahí:
- Guardas secretos de plataforma (GitHub, Groq, Dropbox) — **una vez para todo TechGuard**.
- Creas empresas (Hato Viejo, etc.).
- Ves planes ePayco (catálogo; checkout real aún no cableado del todo).
- Abres el panel de cada empresa.

**2. Admin de la empresa (panel Hato Viejo)**  
Ruta: `/techguard-whatsapp-bot/company/:companyId`.

Ahí **no** vende planes. Solo configura el bot:
- Marca (nombre, tono, horario, disclaimer)
- Skills (markdown de negocio)
- Flujos (JSON de intents: saludo, FAQ, pago, handoff…)
- MCP (URL a datos del negocio)
- Link de pago (consumo del plan ya comprado)
- Claves Meta (Phone Number ID, token, App Secret…) → se **cifran** en Mongo

**3. Job “Generar config + RUNBOOK”**  
El agente (fase 1: generación local de artefacto) arma:
- `bot-config.json` — intents, skills, MCP, tono
- `RUNBOOK.md` — pasos Meta copy-paste
- checklist de webhook  

Eso **no** conecta solo el número: el humano pega en Meta Developer la URL + verify token.

**4. Webhook**  
URL única del subtenant.  
- **GET:** handshake de Meta (verify token) — ya listo.  
- **POST:** mensajes entrantes — stub (501/log) hasta fase 2 runtime con Groq.

---

### Qué “tiene” cada empresa (sin BD propia)

Todo cuelga del `companyId` en la misma Mongo:

```
wa_bot_companies          → perfil + skills + flujos + último runbook
whatsapp_bot_connections  → Meta (1 doc por empresa)
bot_agent_jobs            → historial de jobs por empresa
wa_bot_companies.agentTech → GitHub/Groq/Dropbox **por empresa**
whatsapp_bot_connections  → Meta **por empresa**
(webhook + ePayco)        → infra compartida del subtenant
```

Aislamiento = **filas por `companyId`**, no base nueva.

---

### Relación con P2L / cupos

```
P2L (capacidad BD / procesamiento)
  └── TechGuard (1 Mongo: p2l_techguard_whatsapp_bot)
        ├── Empresa A  → bot + conexión WA + jobs
        ├── Empresa B  → …
        └── Secretos plataforma + planes ePayco
```

P2L “vende” capacidad al subtenant; TechGuard “vende” planes de bot a empresas; la empresa solo opera su bot.

---

### Fase 1 vs fase 2

| Ya | Después |
|----|---------|
| Landing + login + 2 dashboards | Runtime que responde WhatsApp con Groq |
| Persistir config + cifrar secretos | Plantillas HSM vía API |
| Job → config + RUNBOOK | Multi-proveedor (Twilio, etc.) |
| Webhook GET verify | Enrutar POST → empresa → LLM → reply |

---

### Ejemplo concreto

1. Creas **Hato Viejo** → doc company + connection + `companyKey` + `verifyToken`.  
2. Pegas Phone Number ID + token Meta en el panel empresa.  
3. En Meta Developer: Callback = webhook TechGuard + ese verify token.  
4. Generas el job → copias pasos del RUNBOOK.  
5. (Fase 2) Un mensaje al número llega al webhook → se identifica la empresa por `phoneNumberId` → responde con skills/flujos.

Si quieres, el siguiente paso natural es cablear el **checkout ePayco** de los planes o el **runtime del POST** del webhook.

---

## Archivos tocados (front y back)

### Backend (`modelos_back/`)

| Archivo | Rol |
|---------|-----|
| `modelos_back/tenants/tenants.config.js` | Tenant `p2l-techguard-whatsapp-bot` + `mongoDb` |
| `modelos_back/.env.example` | Bloque env TechGuard (API key, ePayco, Groq/GitHub, etc.) |
| `modelos_back/db/techguardWhatsappBotModels.js` | Modelos Mongo: Company, Connection, Job, PlatformSecrets + planes |
| `modelos_back/services/techguardWhatsappBotService.js` | Dominio: CRUD empresas, WA cifrado, platform secrets, jobs config+RUNBOOK, webhook verify/stub |
| `modelos_back/routes/techguardWhatsappBotRoutes.js` | Rutas API + webhook Meta GET/POST |
| `modelos_back/server.js` | Mount `/api/p2l-techguard-whatsapp-bot` |

### Frontend (`src/`)

| Archivo | Rol |
|---------|-----|
| `src/api/techguardWhatsappBotApi.js` | Cliente HTTP del subtenant |
| `src/views/CompanyWhatsappIaBotDashboardView.vue` | Dashboard TechGuard (empresas, planes, secretos, analytics) |
| `src/views/CompanyWhatsappIaBotCompanyView.vue` | Dashboard empresa (marca, skills, flujos, MCP, WA, runbook) |
| `src/views/Login.vue` | White-label `techguard-whatsapp-bot` + estilos alineados a la landing |
| `src/router/index.js` | Login, dashboard, company, redirects `/p2l-tenant/...` |

### Landing / docs

| Archivo | Rol |
|---------|-----|
| `docs/gh-pages-techguard-whatsapp-bot/index.html` | Landing SEO (gh-pages) |
| `docs/gh-pages-techguard-whatsapp-bot/publish-gh-pages.js` | Publish a `wbsckt3/techguard-whatsapp-bot-landing` |
| `docs/gh-pages-techguard-whatsapp-bot/README.md` | Instrucciones de publish |
| `docs/gh-pages-landings-catalog.md` | Fila + sección TechGuard en el catálogo |

### No tocados en este producto (homónimos Medusa / ledger)

Estos archivos ya existían y **no** son el Bot Factory WhatsApp:

- `src/utils/techguardLedger.js`
- `src/utils/techguardLedgerSync.js`
- `src/data/techguardLedgerSeed.json`
- `modelos_back/services/techguardLedgerHubService.js`

---

## Confirmación del flujo (post checkout ePayco + planes en BD)

### Confirmación del flujo

Sí, con un matiz en WhatsApp:

1. **Planes ePayco configurables** en dashboard subtenant → **sí** (colección Mongo `wa_bot_plans`).
2. **Landing compra** → entrega acceso al **dashboard empresa** (`panelUrl`) → **sí** (email aún stub).
3. **Al pagar** se crea el **registro de empresa** en el subtenant → **sí** (`createFromPurchase` / confirmación ePayco).
4. **Allí (subtenant)** se configura el **agente técnico** de esa empresa (Gmail + GitHub + Groq + Dropbox por bot) → **sí** (`agentTech` / `agentRuntimeEmail`).
5. **La empresa provee WhatsApp API en su dashboard** → **sí si el plan es `customer` o `hybrid`**. Si el plan es `techguard`, Meta lo pone el admin en el subtenant y la empresa solo ve contenido.
6. **TechGuard = webhook Meta** y orquesta el agente IA de esa empresa → **sí** (GET verify listo; runtime de mensajes = fase 2, pero el cableado por empresa ya está).

---

### ¿Planes en BD?

**Sí.** Los planes que ve el cliente en la landing salen de **Mongo** (`GET /public/plans`), editables en el subtenant.

En **`.env`** quedan (y deben quedar) solo datos de cuenta ePayco / infra:

- `TECHGUARD_WA_EPAYCO_PUBLIC_KEY`
- `TECHGUARD_WA_EPAYCO_PRIVATE_KEY`
- `TECHGUARD_WA_EPAYCO_P_CUST_ID`
- `TECHGUARD_WA_EPAYCO_P_KEY`
- `TECHGUARD_WA_EPAYCO_TEST`
- bases públicas (`TECHGUARD_WA_PUBLIC_API_BASE`, `TECHGUARD_WA_PUBLIC_FRONTEND_BASE`)

Los `TECHGUARD_WA_PLAN_*_PRICE` del `.env.example` solo sirven de **semilla** la primera vez que se insertan planes; después la fuente de verdad es la **BD**.

---

### Archivos modificados / creados

**Backend**
- `modelos_back/tenants/tenants.config.js`
- `modelos_back/server.js` (mount + CORS github.io)
- `modelos_back/.env.example`
- `modelos_back/db/techguardWhatsappBotModels.js` *(nuevo)*
- `modelos_back/services/techguardWhatsappBotService.js` *(nuevo)*
- `modelos_back/routes/techguardWhatsappBotRoutes.js` *(nuevo)*

**Frontend**
- `src/router/index.js`
- `src/views/Login.vue`
- `src/api/techguardWhatsappBotApi.js` *(nuevo)*
- `src/views/CompanyWhatsappIaBotDashboardView.vue` *(nuevo)*
- `src/views/CompanyWhatsappIaBotCompanyView.vue` *(nuevo)*

**Landing / docs**
- `docs/gh-pages-techguard-whatsapp-bot/` *(nuevo: index, publish, README, md entrega…)*
- `docs/gh-pages-landings-catalog.md`
