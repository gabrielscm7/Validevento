# PRD — Validevento v2.0
## Product Requirements Document — Versão 2.0

**Data:** Setembro 2026
**Versão anterior:** PRD v1.0 (sistema de validação de portaria)
**Infraestrutura alvo:** Railway Hobby + Vercel Free + Supabase Free + Resend Free

---

## 1. Visão Geral

### 1.1 Objetivo
Evoluir o Validevento de uma ferramenta de uso próprio para um **sistema SaaS de gestão completa de eventos**, capaz de atender clientes externos com múltiplos eventos, equipes configuráveis, validação flexível e relatórios de auditoria — operando inicialmente com custo zero de infraestrutura.

### 1.2 Escopo desta versão
- 1 cliente ativo
- 1 evento simultâneo
- Até 3.000 acessos por evento
- Infraestrutura 100% no tier gratuito dos serviços escolhidos

### 1.3 O que muda em relação à v1

| Dimensão | v1 | v2 |
|---|---|---|
| Modelo | Ferramenta própria | SaaS multi-tenant |
| Hierarquia | 3 perfis fixos | Master → Cliente → Admin → Supervisor → Validador |
| Autenticação | Email + senha | CPF + senha + verificação de email |
| Ingressos | Só importação | Importação + geração avulsa + ingresso master |
| Validação | QRCode fixo | Configurável por evento |
| Checkout | Não existe | Opcional, ativável em tempo real |
| Relatórios | CSV simples | PDF, Markdown, auditoria completa |
| Eventos | Um de cada vez | Múltiplos por cliente |

### 1.4 Fora do escopo desta versão
- Pagamento e cobrança automática de clientes
- App nativo (iOS/Android)
- Integração direta com sistemas externos via API
- Múltiplos clientes simultâneos (previsto para v3)
- Envio de ingressos por WhatsApp ou e-mail

---

## 2. Hierarquia de Usuários

```
MASTER (proprietário do sistema)
│  Cria e gerencia clientes
│  Define cotas por cliente
│  Acesso total a tudo
│
└── ADMIN DO CLIENTE (ex: "Paulista Eventos")
    │  Cria e configura eventos
    │  Gerencia equipe do cliente
    │  Importa ingressos, gera convites
    │  Exporta relatórios
    │
    ├── SUPERVISOR
    │   Acessa eventos designados pelo Admin
    │   Visualiza dashboard em tempo real
    │   Ativa/desativa checkout
    │   Gera convites avulsos
    │   Abre e fecha portões
    │   Exporta relatórios
    │
    └── VALIDADOR
        Acessa apenas a tela de portaria
        dos eventos aos quais foi designado
```

### 2.1 Cotas por cliente (configuradas pelo Master)

| Cota | Padrão inicial |
|---|---|
| Admins | 2 |
| Supervisores | 5 |
| Validadores | 10 |
| Ingressos por evento | 3.000 |
| Eventos simultâneos | 1 |

### 2.2 Login
- O login de todos os usuários é feito com **CPF + senha**
- CPF armazenado com hash bcrypt (nunca em texto puro)
- Cadastro exige verificação de e-mail antes do primeiro acesso
- Recuperação de senha via e-mail

---

## 3. Requisitos Funcionais

### RF-01 — Gestão de Clientes (Master)

**Descrição:** O Master pode criar, editar, suspender e excluir clientes do sistema.

**Comportamento:**
- Cadastro de cliente: nome da empresa, CNPJ, e-mail de contato, plano
- Definição de cotas: quantidade de cada perfil de usuário, ingressos por evento
- Ativação/suspensão de cliente sem perda de dados
- Visualização de uso atual vs. cota (ingressos utilizados, eventos criados)

**Critério de aceite:**
- Master consegue criar um cliente e definir cotas em menos de 2 minutos
- Suspensão de cliente bloqueia login de todos os usuários do cliente imediatamente

---

### RF-02 — Gestão de Usuários do Cliente (Admin)

**Descrição:** O Admin do cliente gerencia sua equipe dentro das cotas definidas pelo Master.

**Comportamento:**
- Cadastro de usuário: nome completo, CPF, e-mail, perfil (supervisor ou validador)
- Sistema envia e-mail de boas-vindas com link para definir senha
- Edição de perfil e desativação de usuários
- Visualização de cotas usadas vs. disponíveis
- Designação de usuários a eventos específicos

**Critério de aceite:**
- Admin não consegue criar mais usuários do que a cota permite
- Usuário desativado perde acesso imediatamente
- E-mail de boas-vindas chega em até 2 minutos

---

### RF-03 — Criação e Configuração de Evento (Admin)

**Descrição:** Admin cria um evento e define todas as suas configurações antes da operação.

**Campos do evento:**
- Nome do evento
- Data e horário previsto de início
- Local (endereço ou descrição)
- Capacidade máxima
- Responsáveis (lista de nomes)
- Equipe designada (supervisores e validadores do cliente)

**Configurações de validação:**
- Modo QRCode: qual campo será lido (ticket_code UUID, CPF, hash customizado)
- Modo manual: quais campos podem ser usados para busca (nome, CPF, código — múltiplos)
- Ambos os modos podem estar ativos simultaneamente

**Configurações de check-in:**
- Checkout habilitado: sim/não (pode ser alterado durante o evento pelo Supervisor)
- Modalidade de reentrada (independente do checkout):
  - Sem reentrada: segundo check-in sempre bloqueado
  - Reentrada livre: segundo check-in sempre permitido sem checkout prévio
  - Reentrada condicionada: segundo check-in só permitido se houver checkout registrado
- Alerta de duplicata: bloquear ou apenas avisar
- Velocidade alvo de validação (para métrica no dashboard)

**Configurações de relatório:**
- Formatos de exportação: Markdown, CSV
- Log de auditoria: sim/não
- Rastreamento de abertura/fechamento de portões: sim/não

**Critério de aceite:**
- Evento criado e configurado em menos de 5 minutos
- Configurações podem ser editadas até o início do evento
- Após o início, apenas Supervisor+ pode alterar configurações operacionais

---

### RF-04 — Gestão de Lotes e Ingressos (Admin)

**Descrição:** Admin cria lotes de ingressos e gerencia a base de participantes.

**Lotes:**
- Criação de lote: nome, quantidade, descrição
- Edição e exclusão de lotes (desde que sem ingressos validados)
- Visualização de ocupação por lote

**Ingressos:**
- Importação via CSV/XLSX (mantém a lógica da v1 com mapeamento flexível de colunas)
- Listagem com filtros: status, lote, data de validação
- Edição individual de status (ativo → bloqueado e vice-versa)
- Busca por código, nome ou CPF

**Critério de aceite:**
- Importação de 3.000 registros em menos de 30 segundos
- Listagem com paginação de 50 itens por página
- Filtros aplicados em menos de 1 segundo

---

### RF-05 — Ingressos de Emergência

**Descrição:** Mecanismos para lidar com situações imprevistas na portaria sem interromper o fluxo.

#### RF-05a — Ingresso Master
- Um código especial por evento gerado pelo Admin antes do evento
- Pode ser usado por qualquer validador para liberar uma pessoa
- Limite de usos definido pelo Admin (sem padrão fixo — pode ser ilimitado)
- Cada uso é registrado no log com: quem usou, horário, nome do beneficiado (digitado pelo validador)
- Exibe contador de usos realizados na tela do validador (e restantes, se limite definido)

#### RF-05b — Gerador de Convite Avulso
- Supervisor ou Admin gera um UUID novo na hora
- Vincula a um nome (obrigatório) e CPF (opcional)
- Convite gerado entra imediatamente na base como status `active`
- Origem marcada como `cortesia` no log
- Pode ser exibido na tela como QRCode para o participante escanear

#### RF-05c — Liberação em Lista
- Admin faz upload de lista (CSV simples: nome, CPF) para liberação em massa
- Todos os registros entram como `active` com origem `liberacao_especial`
- Útil para casos de duplicata em massa na emissão original

**Critério de aceite:**
- Ingresso master ativável em menos de 10 segundos na portaria
- Convite avulso gerado e utilizável em menos de 30 segundos
- Lista de liberação processada em menos de 10 segundos para até 100 registros

---

### RF-06 — Terminal de Portaria (Validador)

**Descrição:** Interface de validação para uso em celulares e tablets na portaria.

**Comportamento — Check-in:**
- Leitura de QRCode pela câmera do dispositivo
- Busca manual pelos campos configurados no evento (nome, CPF, código)
- Feedback visual em tela cheia (2 segundos):
  - 🟢 VERDE: entrada autorizada
  - 🔴 VERMELHO: não encontrado ou bloqueado
  - 🟡 AMARELO: duplicata detectada
- Feedback sonoro via Web Audio API
- Botão de ingresso master (visível apenas se habilitado)

**Comportamento — Check-out (quando ativo):**
- Segunda leitura do mesmo QRCode registra saída
- Feedback diferenciado: 🔵 AZUL para saída registrada
- Participante com check-out pode fazer novo check-in (reentrada)

**Operação offline:**
- Base local sincronizada via IndexedDB (Dexie.js)
- Todas as validações funcionam sem internet
- Logs enfileirados para sync automático ao reconectar
- Banner de aviso com timestamp do último sync

**Critério de aceite:**
- Tempo médio de validação menor que 3 segundos (leitura + resposta)
- Operação 100% offline durante toda a duração do evento
- Sync automático ao reconectar sem intervenção do operador

---

### RF-07 — Dashboard em Tempo Real (Supervisor+)

**Descrição:** Painel de controle com visão completa do evento em andamento.

**Painéis:**

| Painel | Conteúdo |
|---|---|
| Resumo | Total: ativos / validados / bloqueados / cortesias |
| Ocupação | Barra de progresso vs. capacidade máxima |
| Fluxo por hora | Gráfico de barras de entradas (e saídas, se checkout ativo) |
| Velocidade | Tempo médio de validação vs. meta configurada |
| Lotes | Tabela: lote, gerados, validados, % |
| Terminais | Status online/offline + último sync de cada terminal |
| Alertas | Duplicatas, ingressos master usados, liberações especiais |
| Feed ao vivo | Últimas 20 validações em tempo real |
| Portões | Status aberto/fechado com horários |

**Ações disponíveis no dashboard:**
- Forçar sync em todos os terminais
- Ativar/desativar checkout
- Abrir/fechar portão (registra timestamp)
- Gerar convite avulso
- Exportar relatório

**Critério de aceite:**
- Atualização automática a cada 30 segundos
- Exportação de relatório em menos de 10 segundos
- Funciona em tela cheia no notebook do administrador

---

### RF-08 — Gestão de Portões (Supervisor+)

**Descrição:** Registro formal de abertura e fechamento de portões para fins de auditoria.

**Comportamento:**
- Supervisor registra abertura do portão com um clique (timestamp automático)
- Registro de fechamento idem
- Múltiplos portões por evento (ex: Portão A, Portão B)
- Histórico completo de aberturas e fechamentos no relatório

**Critério de aceite:**
- Registro de abertura/fechamento em menos de 2 cliques
- Timestamp preciso (segundos) registrado e imutável

---

### RF-09 — Relatórios e Exportação (Supervisor+)

**Descrição:** Geração de relatórios completos ao final ou durante o evento.

**Conteúdo do relatório:**
- Resumo geral (totais, percentuais, duração do evento)
- Histórico de portões (abertura, fechamento, responsável)
- Fluxo de entrada por hora (gráfico e tabela)
- Lista completa de validações (código, nome, horário, terminal, tipo)
- Alertas e ocorrências (duplicatas, ingressos master, cortesias)
- Log de ações administrativas (quem fez o quê e quando)
- Métricas: tempo médio de validação, pico de fluxo, terminais mais ativos

**Formatos:**
- **Markdown:** relatório completo em texto estruturado, tratado externamente pelo operador
- **CSV:** dados brutos para análise em planilha

**Critério de aceite:**
- Relatório disponível em até 15 segundos para eventos de até 3.000 pessoas
- Markdown legível sem ferramentas especiais, com seções claras e tabelas formatadas

---

### RF-10 — Log de Auditoria (Admin+)

**Descrição:** Registro imutável de todas as ações relevantes do sistema.

**Eventos auditados:**
- Login e logout de usuários
- Criação, edição e exclusão de eventos, lotes e ingressos
- Abertura e fechamento de portões
- Ativação de ingresso master
- Geração de convites avulsos
- Importações de base
- Ativação/desativação de checkout
- Exportações de relatório

**Campos do log:**
```
id, tenant_id, event_id, user_id, action, entity_type,
entity_id, details (JSON), ip_address, created_at
```

**Critério de aceite:**
- Nenhuma ação auditada pode ser deletada
- Log acessível apenas por Admin e Master
- Exportável em CSV

---

### RF-11 — Autenticação e Segurança

**Descrição:** Sistema de autenticação com CPF como identificador e verificação de e-mail.

**Comportamento:**
- Login: CPF (com ou sem formatação) + senha
- CPF armazenado como hash bcrypt (nunca em texto puro)
- Cadastro de novo usuário pelo Admin envia e-mail de ativação
- Link de ativação expira em 48 horas
- Recuperação de senha via e-mail com link de redefinição (expira em 1 hora)
- Sessão persistente durante o evento (token JWT de 24h)
- Logout manual disponível

**Critério de aceite:**
- E-mail de ativação entregue em até 2 minutos
- CPF nunca aparece em texto puro em nenhum log do sistema
- Sessão sobrevive a reinicialização do navegador

---

## 4. Requisitos Não Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Disponibilidade** | Keep-alive via cron externo garante uptime no dia do evento |
| RNF-02 | **Performance de validação** | Resposta offline < 1s, online < 2s |
| RNF-03 | **Capacidade** | 3.000 participantes, 10 terminais simultâneos |
| RNF-04 | **Compatibilidade** | PWA: Android 10+, iOS 14+, Chrome e Safari |
| RNF-05 | **LGPD** | CPF nunca armazenado em texto puro |
| RNF-06 | **Segurança** | HTTPS obrigatório, JWT, bcrypt, rate limiting |
| RNF-07 | **Usabilidade** | Validador opera após 5 minutos de demonstração |
| RNF-08 | **Resiliência** | Falha de internet não para a portaria |
| RNF-09 | **Auditoria** | Todo acesso e ação relevante logado e imutável |
| RNF-10 | **Custo** | Operação dentro dos tiers gratuitos dos serviços escolhidos |

---

## 5. Requisitos de LGPD

| Princípio | Implementação v2 |
|---|---|
| **Minimização** | CPF usado só para login (hash), não aparece em telas de validação |
| **Finalidade** | Dados usados exclusivamente para controle de acesso ao evento |
| **Segurança** | Hash bcrypt para CPF, HTTPS obrigatório, JWT assinado |
| **Rastreabilidade** | Log de auditoria imutável com todas as ações |
| **Descarte** | Base de cada evento pode ser apagada pós-evento pelo Master |
| **Consentimento** | Verificação de e-mail implica aceite dos termos de uso |

---

## 6. Regras de Negócio

| ID | Regra |
|---|---|
| RN-01 | Comportamento de reentrada definido pelo Admin por evento: sem reentrada, reentrada livre ou reentrada condicionada a checkout |
| RN-02 | Ingresso bloqueado não autoriza entrada em nenhuma circunstância |
| RN-03 | Ingresso master tem limite de usos configurável e não pode ser reutilizado acima do limite |
| RN-04 | Importação não sobrescreve ingressos com status `validated` |
| RN-05 | O sistema informa o validador mas não impede fisicamente a entrada |
| RN-06 | Checkout só pode ser ativado por Supervisor ou acima |
| RN-07 | Logs de entrada e auditoria são imutáveis após gravação |
| RN-08 | Admin não pode criar mais usuários do que a cota do cliente permite |
| RN-09 | Master pode alterar cotas de qualquer cliente a qualquer momento |
| RN-10 | Usuário com CPF não verificado por e-mail não consegue fazer login |
| RN-11 | Convite avulso gerado entra imediatamente na base e pode ser usado na hora |
| RN-12 | Reentrada segue a modalidade configurada pelo Admin: bloqueada, livre ou condicionada a checkout registrado |

---

## 7. Infraestrutura (Custo Zero)

| Serviço | Uso | Tier | Limite relevante |
|---|---|---|---|
| **Railway Hobby** | Backend Node.js | Gratuito | $5 crédito/mês |
| **Vercel Free** | Frontend React/PWA | Gratuito | 100GB bandwidth/mês |
| **Supabase Free** | PostgreSQL | Gratuito | 500MB storage |
| **Resend Free** | E-mails transacionais | Gratuito | 3.000 emails/mês |
| **cron-job.org** | Keep-alive do backend | Gratuito | Ilimitado |

### Estratégia keep-alive
O Railway Hobby pode suspender serviços inativos. Para evitar delay no dia do evento:
- Cadastrar endpoint `GET /health` no cron-job.org
- Intervalo: a cada 5 minutos
- Ativo: 12h antes do evento até 2h após o encerramento

---

## 8. Plano de Contingência

| Falha | Contingência |
|---|---|
| Internet cai na portaria | Terminais operam 100% offline |
| Servidor cai durante evento | Portaria continua; dashboard indisponível |
| QRCode não lê | Busca manual pelos campos configurados |
| Terminal quebra | Terminal reserva assume sem perda de dados |
| Ingresso duplicado na emissão | Ingresso master ou gerador de convite avulso |
| Participante sem ingresso | Convite avulso gerado pelo supervisor na hora |
| E-mail de ativação não chega | Master pode ativar o usuário manualmente |
| Supabase atinge 500MB | Master exporta e limpa eventos antigos |

---

## 9. Marcos de Entrega

### Fase 1 — Fundação multi-tenant (3–4 semanas)
- [ ] Modelo de dados multi-tenant com tenant_id em todas as tabelas
- [ ] Hierarquia de perfis: Master, Admin, Supervisor, Validador
- [ ] Autenticação por CPF + verificação de e-mail (Resend)
- [ ] Painel Master: criação e gestão de clientes e cotas
- [ ] Painel Admin: gestão de usuários e designação a eventos

### Fase 2 — Gestão de evento e ingressos (2–3 semanas)
- [ ] Criação e configuração completa de evento
- [ ] Gestão de lotes e importação de ingressos (mantém lógica v1)
- [ ] Ingresso master (RF-05a)
- [ ] Gerador de convite avulso (RF-05b)
- [ ] Liberação em lista (RF-05c)
- [ ] Configuração de validação por evento (campo do QRCode, campos manuais)

### Fase 3 — Operação e checkout (2 semanas)
- [ ] Terminal de portaria atualizado (checkout, ingresso master, feedback atualizado)
- [ ] Gestão de portões (abertura/fechamento com timestamp)
- [ ] Ativação de checkout em tempo real pelo Supervisor
- [ ] Dashboard atualizado com novas métricas

### Fase 4 — Relatórios e auditoria (2 semanas)
- [ ] Geração de relatório em Markdown estruturado
- [ ] Exportação em CSV
- [ ] Log de auditoria completo (RF-10)
- [ ] Métricas de velocidade de validação e pico de fluxo

### Fase 5 — Testes e deploy (1 semana)
- [ ] Testes integrados com simulação de evento (3.000 ingressos, 10 terminais)
- [ ] Configuração do keep-alive no cron-job.org
- [ ] Deploy Vercel (frontend) + Railway (backend)
- [ ] Treinamento do cliente

---

## 10. Critérios de Sucesso da v2

1. Cliente consegue criar e configurar um evento sem suporte técnico
2. Portaria opera sem interrupção mesmo com queda de internet
3. Ingresso master resolve qualquer situação de emergência em menos de 30 segundos
4. Relatório completo gerado e exportado em menos de 15 segundos
5. Sistema operando dentro dos limites gratuitos dos serviços escolhidos
6. Zero perda de log de entrada ou auditoria
