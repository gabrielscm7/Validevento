# Validevento — Agent Context & Memory

## 🎯 Visão Geral & Objetivo

Sistema de validação de acesso a eventos com operação offline-first, validação por UUID v4 (sem CPF), PWA para celular, e suporte a múltiplos terminais. O validador lê QRCode (câmera), busca manual (nome) ou usa leitor USB (Elgin EL250) para liberar entrada. Admin acompanha ocupação em dashboard em tempo real.

## 🛠️ Stack Tecnológica

### Backend
| Componente | Versão |
|---|---|
| Node.js | 20 |
| Express | 4.19 |
| PostgreSQL | 15 (Docker local / Supabase produção) |
| JWT (jsonwebtoken) | 9.0 |
| bcryptjs | 2.4 |
| multer | 1.4 |
| csv-parse | 5.5 |

### Frontend
| Componente | Versão |
|---|---|
| React | 19.2 |
| Vite | 8 |
| React Router DOM | 7.17 |
| Zustand | 5 (persist) |
| Axios | 1.17 |
| Dexie (IndexedDB) | 4.4 |
| html5-qrcode | 2.3 |
| Tailwind CSS | 3.4 |
| shadcn/ui (base-ui) | — |
| lucide-react | 1.20 |
| recharts | 3.8 |
| Vite PWA plugin | 1.3 |
| Workbox | 7.4 |

### Infra
| Serviço | Função |
|---|---|
| Docker (PostgreSQL 15 Alpine) | Banco local dev |
| Railway | Deploy backend |
| Vercel | Deploy frontend |
| Supabase | PostgreSQL gerenciado (produção) |

## 🔄 Alteração Fundamental: CPF → UUID v4

O sistema foi migrado de validação por CPF (hash SHA-256) para validação por UUID v4. O QRCode agora contém diretamente o `ticket_code` (UUID v4) do ingresso.

### O que mudou:
- **Sem CPF**: não há mais hash, salt por evento, ou CPF no sistema
- **Status simplificados**: `generated`/`linked` → `active`, restando apenas `active`, `validated`, `blocked`
- **Importação**: arquivo espera `ticket_code` (UUID), `batch`, `display_name`, `status`
- **Busca manual**: apenas por nome (`display_name`), sem busca por CPF
- **Logs**: `entry_logs` não armazena mais `hash_cpf`

### Arquivos removidos:
- `backend/src/utils/hash.js`
- `frontend/src/services/hashService.js`

### Migração de banco:
- Executar `backend/migrations/03_uuid_only.sql` em databases existentes

## 🧠 Estado Atual do Projeto

### Implementado e operacional

**Backend (18 endpoints REST):**
- Autenticação JWT com roles (admin, supervisor, validator)
- Importação multi-formato (CSV, JSON, XML, XLSX) sem CPF
- Validação por QRCode (UUID v4) e manual
- Busca de participantes por nome (ILIKE)
- Sync offline: snapshot incremental + envio de logs + heartbeat
- Dashboard completo (sumário, fluxo por hora, lotes, alertas, terminais, live feed, export CSV)
- CRUD de usuários (admin)
- CRUD de lotes (admin)
- Cancelamento de ingressos (individual ou por lote)
- Reset de dados do evento
- Migrações versionadas (01_init_schema, 02_batches, 03_uuid_only)
- Seeds (admin/supervisor/validator + 10 tickets de teste com UUIDs)

**Frontend (4 páginas):**
- **Login** — entrada com email/senha, redirecionamento por role
- **Terminal** — seleção de método (Câmera QRCode / Leitor USB / Busca Manual), validação offline-first, overlay de resultado (verde/amarelo/vermelho), indicador de sync, botão de sync forçado (admin/supervisor)
- **Dashboard** — cards de sumário (ativos/validados/bloqueados), gráfico de entrada por hora, tabela de lotes com % ocupação, feed de alertas (duplicatas/bloqueios), feed ao vivo, status dos terminais, export CSV, reset dados
- **Admin Config** — 4 abas: Usuários CRUD, Lotes CRUD, Cancelar Ingressos, Importar CSV

**Armazenamento local (IndexedDB com Dexie):**
- Stores: tickets, entry_logs, meta (sem hash_cpf)
- Sincronização automática a cada 60 min, ao reconectar, e sob demanda
- Lógica offline-first: valida contra IndexedDB primeiro, fallback para API

## 📜 Regras de Ouro e Premissas (Constraints)

1. **Validação por UUID v4** — QRCode contém o `ticket_code` (UUID v4), que é único no banco
2. **Logs imutáveis** — Entry logs não podem ser deletados ou alterados após criados
3. **Offline-first** — Terminal deve funcionar sem internet; validação usa IndexedDB como fonte primária
4. **Não sobrescrever validated** — CSV import e sync nunca atualizam registros com status `validated`
5. **Duplicatas são logadas, não bloqueadas** — entrada duplicata gera alerta mas decisão é humana
6. **Sync forçado só admin/supervisor** — validator não pode disparar sync manual
7. **Interface para não-técnicos** — Design minimalista, feedback visual (verde/amarelo/vermelho), sem jargão técnico
8. **Portabilidade entre eventos** — Tudo é scoped por event_id; nova importação = novo evento

## 🚀 Próximos Passos (Backlog Ativo)

1. **Testes integrados:** Executar planos de teste atualizados (sem CPF)
2. **Deploy produção:** Configurar Railway + Vercel + Supabase
3. **Treinamento:** Preparar guia rápido para validadores (1 página)
4. **Limpeza:** Remover dependência `xlsx` do backend se não for mais necessário
