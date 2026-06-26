# PRD — Sistema de Validação de Portaria
## Product Requirements Document v1.0

---

## 1. Visão Geral

### 1.1 Objetivo
Desenvolver um sistema de validação de acesso a eventos que opere de forma confiável em ambiente com conectividade instável, proteja dados pessoais conforme a LGPD, e permita controle total do fluxo de entrada por uma equipe não técnica.

### 1.2 Problema que resolve
Eventos com cadastro prévio precisam de controle de acesso ágil, seguro e resiliente. A validação manual (listas impressas) é lenta, sujeita a fraudes e não gera dados de fluxo em tempo real. A dependência exclusiva de sistemas online é um ponto único de falha inaceitável para eventos presenciais.

### 1.3 Fora do escopo
- Geração de ingressos e QRCodes
- Cadastro de participantes
- Envio de ingressos por qualquer canal
- Integração direta com banco de dados interno da empresa
- Pagamento ou controle financeiro

---

## 2. Usuários e Perfis de Acesso

| Perfil | Dispositivo | Permissões |
|---|---|---|
| **Administrador** | Notebook | Acesso total: dashboard, importação, sync, logs, configuração |
| **Validador** | Celular ou tablet | Somente: leitura de QRCode, busca manual, confirmação de entrada |
| **Supervisor de portaria** | Tablet | Dashboard simplificado + permissões de validador |

### 2.1 Premissas de uso
- Validadores não têm conhecimento técnico
- A interface deve funcionar sem treinamento extenso
- Erros de operação não podem comprometer a base de dados

---

## 3. Requisitos Funcionais

### RF-01 — Importação de Base via CSV

**Descrição:** O sistema deve aceitar upload de arquivo CSV exportado do sistema interno da empresa.

**Campos esperados no CSV:**

```
id_ingresso, hash_cpf, nome_exibicao, lote, status
```

**Comportamento:**
- Validar estrutura do arquivo antes de importar
- Atualizar registros existentes (pelo `id_ingresso`)
- Inserir novos registros
- Nunca deletar registros já validados
- Exibir relatório da importação: X inseridos, Y atualizados, Z erros

**Critério de aceite:**
- Upload de CSV com 1.000 linhas processado em menos de 10 segundos
- Importação com erros parciais não compromete os registros válidos

---

### RF-02 — Sincronização Automática

**Descrição:** O sistema deve sincronizar a base de dados com os terminais de portaria periodicamente.

**Comportamento:**
- Sync automático a cada 60 minutos
- Botão "Sincronizar agora" disponível para o Administrador e Supervisor
- Cada terminal exibe timestamp da última sincronização
- Sync incremental: apenas registros alterados desde o último sync

**Critério de aceite:**
- Sync de 1.000 registros completo em menos de 5 segundos em rede local
- Terminal exibe claramente quando está operando com base desatualizada (> 2h)

---

### RF-03 — Validação por QRCode

**Descrição:** Terminal de portaria lê QRCode pela câmera do dispositivo e valida o ingresso.

**Comportamento:**
- QRCode contém o CPF do participante (conforme gerado pelo sistema interno)
- Sistema faz hash do CPF lido e consulta a base local
- Resposta em menos de 1 segundo
- Feedback visual e sonoro imediato:
  - 🟢 **VERDE + som positivo:** ingresso válido, exibe nome de exibição
  - 🔴 **VERMELHO + som de alerta:** ingresso não encontrado
  - 🟡 **AMARELO + som de alerta:** CPF já registrou entrada (duplicata)

**Estados possíveis do ingresso:**

| Status | Significado | Ação permitida |
|---|---|---|
| `generated` | Ingresso existe mas sem CPF vinculado | Bloquear, alertar supervisor |
| `linked` | CPF vinculado, ainda não entrou | ✅ Validar entrada |
| `validated` | Já registrou entrada | 🟡 Alertar duplicata |
| `blocked` | Ingresso cancelado ou suspenso | 🔴 Bloquear |

**Critério de aceite:**
- Leitura bem-sucedida em até 2 tentativas com câmera traseira do dispositivo
- Feedback visual perceptível a 1 metro de distância

---

### RF-04 — Busca Manual

**Descrição:** Validador pode buscar um participante sem o QRCode.

**Comportamento:**
- Campo de busca por CPF (com ou sem formatação) ou nome completo
- Busca por nome: mínimo 3 caracteres, retorna lista com até 10 resultados
- Busca por CPF: retorna resultado único
- Exibe: nome de exibição, ID do ingresso, status atual
- Botão "Confirmar entrada" após localizar o participante
- Registro no log marcado como `entrada_manual` (distinto de `entrada_qrcode`)

**Critério de aceite:**
- Busca por nome retorna resultado em menos de 1 segundo na base local
- CPF pode ser digitado com ou sem pontuação (111.222.333-44 ou 11122233344)

---

### RF-05 — Log de Entrada

**Descrição:** Todo registro de entrada deve ser logado com informações suficientes para auditoria.

**Campos do log:**

```
id_log, id_ingresso, hash_cpf, timestamp, tipo_entrada,
id_validador, id_terminal, sincronizado
```

**Comportamento:**
- Log gravado localmente no terminal imediatamente após validação
- Sincronizado com servidor central na próxima conexão disponível
- Log nunca é deletado, apenas marcado como `sincronizado`
- Entradas duplicatas são logadas com flag `duplicata: true`

**Critério de aceite:**
- Nenhum registro de entrada perdido mesmo com queda de rede no momento da validação
- Log exportável em CSV pelo Administrador ao final do evento

---

### RF-06 — Dashboard do Administrador

**Descrição:** Painel de controle com visão em tempo real do evento.

**Painéis obrigatórios:**

| Painel | Dado exibido |
|---|---|
| **Resumo geral** | Total gerados / Vinculados / Validados / Pendentes |
| **Fluxo por hora** | Gráfico de barras de entradas por hora |
| **Status por lote** | Tabela: lote, qtd gerada, qtd validada, % ocupação |
| **Alertas** | Lista de duplicatas e ingressos bloqueados tentados |
| **Terminais ativos** | Quais terminais estão online/offline e último sync |
| **Últimas entradas** | Feed em tempo real das últimas 20 validações |

**Critério de aceite:**
- Dashboard atualiza automaticamente a cada 30 segundos
- Funciona em tela cheia no notebook do administrador
- Exportação de relatório completo em CSV com 1 clique

---

### RF-07 — Operação Offline dos Terminais

**Descrição:** Terminal de portaria deve operar sem interrupção mesmo sem conectividade.

**Comportamento:**
- Base local sincronizada é suficiente para todas as operações de validação
- Logs gerados offline são enfileirados para sync posterior
- Interface exibe banner de aviso quando offline: *"Modo offline — último sync: HH:MM"*
- Ao reconectar, sync ocorre automaticamente em background

**Critério de aceite:**
- Terminal opera 100% das funções de validação sem internet
- Reconexão e sync automático sem intervenção do operador

---

### RF-08 — Controle de Acesso por Perfil

**Descrição:** Cada usuário acessa apenas o que seu perfil permite.

**Comportamento:**
- Login por e-mail e senha (sem OAuth externo — simplicidade e confiabilidade)
- Sessão persistente no dispositivo durante o evento (não expirar a cada hora)
- Logout manual disponível
- Administrador pode criar, editar e desativar usuários

**Critério de aceite:**
- Validador não consegue acessar dashboard ou importar CSV
- Sessão sobrevive a reinicialização do navegador no mesmo dispositivo

---

## 4. Requisitos Não Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Disponibilidade** | Sistema central 99% uptime no dia do evento |
| RNF-02 | **Performance de validação** | Resposta em < 1 segundo na base local |
| RNF-03 | **Capacidade** | Suportar 1.000 participantes e 8 terminais simultâneos |
| RNF-04 | **Compatibilidade** | PWA funcional em Android 10+, iOS 14+, Chrome e Safari |
| RNF-05 | **LGPD** | CPF nunca armazenado em texto puro no sistema de validação |
| RNF-06 | **Segurança** | Comunicação HTTPS, senhas com hash bcrypt |
| RNF-07 | **Usabilidade** | Validador opera sem manual após 5 minutos de demonstração |
| RNF-08 | **Resiliência** | Falha de 1 terminal não afeta os demais |
| RNF-09 | **Auditoria** | Todo acesso e validação registrado em log imutável |
| RNF-10 | **Portabilidade** | Sistema reaproveitável para eventos futuros com nova importação |

---

## 5. Requisitos de LGPD

| Princípio | Implementação |
|---|---|
| **Minimização** | Apenas hash CPF e nome parcial no sistema de validação |
| **Finalidade** | Dados usados exclusivamente para controle de acesso |
| **Segurança** | Hash SHA-256 com salt fixo por evento, HTTPS obrigatório |
| **Rastreabilidade** | Todo acesso a dados logado com usuário e timestamp |
| **Descarte** | Base do sistema de validação pode ser apagada pós-evento sem afetar sistema interno |

---

## 6. Regras de Negócio

| ID | Regra |
|---|---|
| RN-01 | Um CPF só pode registrar entrada uma vez por evento |
| RN-02 | Ingressos com status `generated` (sem CPF vinculado) não autorizam entrada |
| RN-03 | Entrada duplicata é logada mas não autorizada sem confirmação do supervisor |
| RN-04 | Importação CSV não pode sobrescrever registros já com status `validated` |
| RN-05 | O sistema não impede fisicamente a entrada — apenas informa o validador |
| RN-06 | Sync forçado só pode ser executado por Administrador ou Supervisor |
| RN-07 | Logs de entrada são imutáveis após gravação |

---

## 7. Integrações

| Sistema | Tipo | Direção | Formato |
|---|---|---|---|
| Sistema interno da empresa | Manual / agendado | Entrada | CSV |
| Terminais de portaria | Sync via API REST | Bidirecional | JSON |
| Dispositivos de câmera | API nativa do browser | Local | — |

---

## 8. Critérios de Sucesso do Produto

O sistema será considerado bem-sucedido se:

1. **Zero filas** causadas por falha do sistema de validação
2. **Zero perdas** de log de entrada por falha técnica
3. **Tempo médio de validação** menor que 5 segundos por pessoa (leitura + resposta)
4. **Administrador consegue** visualizar ocupação em tempo real sem suporte técnico
5. **Sistema reutilizável** no próximo evento apenas com nova importação de CSV

---

## 9. Plano de Contingência Documentado

| Falha | Contingência |
|---|---|
| Internet cai na portaria | Terminais operam offline automaticamente |
| Servidor central cai | Portaria mantém operação, dashboard indisponível |
| QRCode não lê | Busca manual por CPF ou nome |
| Terminal quebra/descarrega | Terminal reserva assume sem perda de dados |
| CSV com erro de formato | Sistema rejeita e exibe erro descritivo, base anterior mantida |
| Duplicata detectada | Alerta para validador, decisão humana |

---

## 10. Marcos de Entrega

| Marco | Entregável | Prazo sugerido |
|---|---|---|
| **M1** | Spec técnica aprovada | Dia 3 |
| **M2** | Backend + banco + importação CSV funcionando | Dia 8 |
| **M3** | Terminal de portaria (validação + busca + offline) | Dia 13 |
| **M4** | Dashboard ADM + sync multi-terminal | Dia 16 |
| **M5** | Testes integrados + simulação de evento | Dia 18 |
| **M6** | Deploy produção + treinamento da equipe | Dia 19–20 |
| **Evento** | Operação real | Dia 29/06/2026 |
