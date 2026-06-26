# Validevento — Agent Context & Memory

## 🎯 Visão Geral & Objetivo

Sistema de validação de acesso a eventos com operação offline-first, proteção LGPD (CPF hasheado), PWA para celular, e suporte a múltiplos terminais. O validador lê QRCode (câmera), busca manual (nome/CPF) ou usa leitor USB (Elgin EL250) para liberar entrada. Admin acompanha ocupação em dashboard em tempo real.

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

## 🧠 Estado Atual do Projeto

### Implementado e operacional

**Backend (18 endpoints REST):**
- Autenticação JWT com roles (admin, supervisor, validator)
- Importação CSV com hash automático de CPF
- Validação por QRCode e manual
- Busca de participantes por nome (ILIKE) ou CPF exato
- Sync offline: snapshot incremental + envio de logs + heartbeat
- Dashboard completo (sumário, fluxo por hora, lotes, alertas, terminais, live feed, export CSV)
- CRUD de usuários (admin)
- CRUD de lotes (admin)
- Cancelamento de ingressos (individual ou por lote)
- Reset de dados do evento
- Migrações versionadas (01_init_schema, 02_batches)
- Seeds (admin/supervisor/validator + 10 tickets de teste)

**Frontend (4 páginas):**
- **Login** — entrada com email/senha, redirecionamento por role
- **Terminal** — seleção de método (Câmera QRCode / Leitor USB / Busca Manual), validação offline-first, overlay de resultado (verde/amarelo/vermelho), indicador de sync, botão de sync forçado (admin/supervisor)
- **Dashboard** — cards de sumário, gráfico de entrada por hora, tabela de lotes com % ocupação, feed de alertas (duplicatas/bloqueios), feed ao vivo, status dos terminais, export CSV, reset dados
- **Admin Config** — 4 abas: Usuários CRUD, Lotes CRUD, Cancelar Ingressos, Importar CSV

**Armazenamento local (IndexedDB com Dexie):**
- Stores: tickets, entry_logs, meta
- Sincronização automática a cada 60 min, ao reconectar, e sob demanda
- Lógica offline-first: valida contra IndexedDB primeiro, fallback para API

### Diferenças entre SPEC e stack atual

| Especificado (SPEC) | Implementado | Compatível? |
|---|---|---|
| React 18 | React 19.2 | ✅ (retrocompatível) |
| React Router v6 | React Router DOM 7.17 | ✅ (v7 é evolução do v6) |
| Vite (genérico) | Vite 8 | ✅ |
| Node.js 20 | Node.js 20 | ✅ idêntico |
| Express 4 | Express 4.19 | ✅ |
| PostgreSQL 15 | PostgreSQL 15 | ✅ idêntico |
| Dexie.js | Dexie 4.4 | ✅ |
| Zustand | Zustand 5 | ✅ |
| PWA + Workbox | Vite PWA plugin + Workbox 7 | ✅ |
| Tailwind CSS | Tailwind 3.4 | ✅ |
| csv-parse | csv-parse 5.5 | ✅ |
| bcrypt | bcryptjs 2.4 | ✅ |
| Multer | multer 1.4 | ✅ |
| JWT | jsonwebtoken 9.0 | ✅ |

A stack atual é **100% compatível** com o especificado no PRD e na SPEC. As diferenças são apenas versões mais recentes, todas retrocompatíveis.

## 📜 Regras de Ouro e Premissas (Constraints)

1. **CPF nunca em texto puro** — Sempre hashear com SHA-256 + salt do evento antes de armazenar ou comparar
2. **Logs imutáveis** — Entry logs não podem ser deletados ou alterados após criados
3. **Offline-first** — Terminal deve funcionar sem internet; validação usa IndexedDB como fonte primária
4. **Não sobrescrever validated** — CSV import e sync nunca atualizam registros com status `validated`
5. **Duplicatas são logadas, não bloqueadas** — RN-03: entrada duplicata gera alerta mas decisão é humana
6. **Sync forçado só admin/supervisor** — RN-06: validator não pode disparar sync manual
7. **Um CPF = uma entrada** — RN-01: blocking duplicates after first validation
8. **Generated não autoriza entrada** — RN-02: tickets sem CPF vinculado não podem ser validados
9. **Interface para não-técnicos** — Design minimalista, feedback visual (verde/amarelo/vermelho), sem jargão técnico
10. **Portabilidade entre eventos** — Tudo é scoped por event_id; nova importação = novo evento

## 🚀 Próximos Passos (Backlog Ativo)

1. **Dashboard — Aba Ingressos:** Implementar tabela de ingressos com busca, filtros e ações (cancelar/bloquear)
2. **Admin Config — Aba Ingressos:** Finalizar interface de cancelamento em lote com preview
3. **Validação por CPF no SearchPanel:** Adicionar validação direta por CPF (não apenas nome)
4. **Modo escuro automático:** Seguir preferência do sistema (já configurado no Tailwind)
6. **Testes integrados:** Executar T-01 a T-12 da SPEC
7. **Deploy produção:** Configurar Railway + Vercel + Supabase
8. **Treinamento:** Preparar guia rápido para validadores (1 página)
