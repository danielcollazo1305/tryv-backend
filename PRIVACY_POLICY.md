# Política de Privacidade — Tryv

**Última atualização:** [DATA A DEFINIR]

> ⚠️ **AVISO IMPORTANTE:** Este documento é um rascunho inicial, criado como ponto de partida. Não constitui aconselhamento jurídico. Antes de publicar este documento ou submeter o app à App Store, recomenda-se revisão por um advogado especializado em proteção de dados (LGPD) e, idealmente, com conhecimento das exigências da Apple para apps que utilizam HealthKit.

---

## 1. Introdução

Esta Política de Privacidade descreve como o **Tryv** ("nós", "nosso" ou "aplicativo") coleta, usa, armazena e protege as informações dos usuários ("você") ao utilizar nosso aplicativo de fitness multiplataforma.

Ao criar uma conta ou usar o Tryv, você concorda com as práticas descritas nesta política.

**Responsável pelo tratamento de dados (Controlador):**
[NOME COMPLETO OU RAZÃO SOCIAL A DEFINIR]
[CPF/CNPJ A DEFINIR]
[E-MAIL DE CONTATO A DEFINIR]

---

## 2. Quais Dados Coletamos

### 2.1 Dados de Cadastro e Perfil
- Nome
- E-mail
- Senha (armazenada de forma criptografada via bcrypt, nunca em texto plano)
- Peso (opcional, fornecido no cadastro ou posteriormente)
- Altura, objetivo (ex: emagrecimento, hipertrofia, resistência) e meta calórica diária (opcionais, fornecidos no perfil)
- Foto de perfil (opcional)

### 2.2 Dados de Saúde e Atividade Física
- **Refeições:** fotos de alimentos (quando você opta pelo registro por foto) e/ou dados nutricionais inseridos manualmente (calorias, proteínas, carboidratos, gorduras)
- **Treinos:** treinos gerados por IA e o histórico de treinos realizados
- **Atividades físicas:** dados de GPS durante corridas e pedaladas (localização, rota, distância, velocidade, tempo), além de atividades registradas manualmente (natação, lutas, outras modalidades)
- **Peso corporal:** registros de peso ao longo do tempo, quando fornecidos por você
- **Dados do Apple Health (HealthKit):** mediante sua autorização explícita, podemos ler dados como passos, distância percorrida, calorias ativas, frequência cardíaca e dados de sono já existentes no aplicativo Saúde do seu iPhone. Esses dados podem ter origem no próprio iPhone ou em aplicativos de terceiros (como aplicativos de smartwatch) que você tenha autorizado a escrever no Apple Health.
- **Frequência cardíaca:** quando disponível via HealthKit, sincronizamos amostras de frequência cardíaca para calcular métricas como o Score de Prontidão para Treino e, durante uma atividade com GPS em andamento, para exibição a um professor autorizado (ver seção 4.1). Na prática, essa leitura só está disponível para usuários com Apple Watch ou outro dispositivo compatível conectado ao Apple Health — o iPhone sozinho não possui sensor de frequência cardíaca.

### 2.3 Dados de Pagamento
Processamos pagamentos de assinaturas através do **Stripe**, um processador de pagamentos terceirizado. O Tryv **não armazena** números completos de cartão de crédito ou dados financeiros sensíveis — esses dados são tratados diretamente pelo Stripe, conforme os padrões de segurança PCI-DSS.

### 2.4 Dados de Professores (Marketplace)
Para usuários que se cadastram como professores de educação física, coletamos adicionalmente:
- Número de registro profissional (CREF) para fins de verificação
- Dados de conta bancária/Stripe Connect para processamento de repasses
- Informações de perfil profissional exibidas publicamente no marketplace

### 2.5 Dados de Uso da Rede Social
- Posts, comentários, curtidas e conexões de "seguir" realizadas dentro do aplicativo
- Fotos e mídias enviadas para publicações

---

## 3. Como Usamos Seus Dados

Utilizamos os dados coletados para:

- Fornecer as funcionalidades principais do aplicativo (nutrição, treino, atividades, rede social, marketplace)
- Gerar análises nutricionais automatizadas a partir de fotos de refeições, utilizando serviços de inteligência artificial (ver seção 5)
- Gerar treinos personalizados através de inteligência artificial
- Calcular métricas de saúde e desempenho, como o Dashboard de Evolução, Score de Prontidão para Treino e Insights personalizados
- Processar pagamentos de assinaturas e repasses a professores
- Permitir que professores autorizados (mediante assinatura ativa) vejam quando um aluno está treinando no momento e acompanhem, em tempo real, a localização e as métricas (distância, ritmo, tempo e frequência cardíaca quando disponível) de uma atividade com GPS enquanto ela estiver em andamento
- Viabilizar a rede social do aplicativo (feed, seguir, curtir, comentar)
- Melhorar e manter a segurança do aplicativo

**Não vendemos seus dados pessoais a terceiros.**

---

## 4. Compartilhamento de Dados

### 4.1 Com Professores
Se você contratar um professor através do marketplace do Tryv, dois tipos de informação passam a ficar visíveis para esse professor, exclusivamente enquanto sua assinatura estiver ativa:

- Se você está com uma atividade (corrida ou pedalada com GPS) em andamento neste exato momento;
- Enquanto essa atividade estiver em andamento, sua localização, distância percorrida, ritmo, tempo decorrido e frequência cardíaca (quando disponível).

Essa visibilidade é limitada à atividade acontecendo ao vivo. O professor **não** tem acesso ao seu histórico de treinos, refeições, peso ou outros dados além do que está descrito acima.

### 4.2 Com Prestadores de Serviço (Subprocessadores)
Utilizamos os seguintes serviços de terceiros para operar o Tryv:

| Serviço | Finalidade |
|---|---|
| **Anthropic (Claude API)** | Análise de fotos de refeições, geração de treinos personalizados, geração de insights |
| **Amazon Web Services (S3)** | Armazenamento de mídias (fotos de refeições, posts, perfis) |
| **Stripe / Stripe Connect** | Processamento de pagamentos e repasses a professores |
| **Apple (HealthKit)** | Leitura de dados de saúde, mediante sua autorização |

Esses serviços processam dados em nosso nome, sob suas próprias políticas de privacidade e segurança.

### 4.3 Por Obrigação Legal
Poderemos divulgar dados se exigido por lei, ordem judicial ou para proteger direitos, segurança ou propriedade do Tryv ou de terceiros.

---

## 5. Uso de Inteligência Artificial

O Tryv utiliza a API da Anthropic (Claude) para:
- Analisar fotos de refeições e estimar valores nutricionais
- Gerar treinos personalizados
- Gerar insights motivacionais/informativos com base no seu histórico de atividade

Os dados enviados para esse processamento incluem as imagens de refeições (quando aplicável) e um resumo do seu histórico recente de atividades, treinos e alimentação. Consulte a Política de Privacidade da Anthropic para mais informações sobre como esses dados são tratados por esse fornecedor.

---

## 6. Dados de Saúde (HealthKit) — Seção Específica

Em conformidade com as diretrizes da Apple para uso do HealthKit:

- Solicitamos sua autorização explícita antes de ler qualquer dado no Apple Health
- Você pode revogar essa autorização a qualquer momento em **Ajustes do iPhone → Privacidade e Segurança → Saúde → Tryv**
- **Nunca utilizamos dados de saúde para fins de publicidade**
- Dados de saúde não são compartilhados com terceiros para fins de marketing ou venda de dados
- Você pode solicitar a exclusão dos dados de saúde sincronizados com o Tryv a qualquer momento, entrando em contato conforme a seção 8 — essa exclusão é processada manualmente mediante solicitação, e não há hoje uma ferramenta de autoatendimento no aplicativo para isso

---

## 7. Retenção de Dados

Mantemos seus dados pessoais enquanto sua conta estiver ativa. Após a exclusão da conta, seus dados serão removidos ou anonimizados dentro de [PRAZO A DEFINIR — recomenda-se consultar um advogado sobre prazos legais aplicáveis, especialmente para dados fiscais/financeiros que podem exigir retenção mínima por lei].

O aplicativo não possui hoje uma função de autoexclusão de conta; a exclusão de conta e de dados é feita mediante solicitação por e-mail (ver seção 8) e processada manualmente.

---

## 8. Seus Direitos (LGPD)

Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você tem direito a:

- Confirmar a existência de tratamento de seus dados
- Acessar seus dados
- Corrigir dados incompletos, inexatos ou desatualizados
- Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a lei
- Solicitar a portabilidade de dados a outro fornecedor
- Eliminar dados pessoais tratados com base no seu consentimento
- Revogar o consentimento a qualquer momento
- Obter informações sobre entidades com as quais compartilhamos seus dados

Para exercer esses direitos, entre em contato através de: [E-MAIL DE CONTATO A DEFINIR]. Essas solicitações são atendidas manualmente pela nossa equipe.

---

## 9. Segurança dos Dados

Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo:
- Criptografia de senhas (bcrypt)
- Comunicação segura via HTTPS
- Autenticação via tokens de acesso (JWT)
- Controle de acesso a dados sensíveis
- Armazenamento de mídias em infraestrutura segura (AWS S3)

Apesar dos esforços, nenhum sistema é 100% seguro, e não podemos garantir segurança absoluta contra acessos não autorizados.

---

## 10. Privacidade de Menores

O Tryv não é destinado a menores de 16 anos. Não coletamos intencionalmente dados de menores sem o consentimento apropriado dos responsáveis legais.

O cadastro no aplicativo não coleta data de nascimento nem realiza verificação de idade — a definição de uma idade mínima nesta política deve vir acompanhada, se exigido pela orientação jurídica, de um mecanismo de verificação correspondente no cadastro.

---

## 11. Alterações a Esta Política

Podemos atualizar esta Política de Privacidade periodicamente. Notificaremos sobre alterações significativas através do aplicativo ou por e-mail. A data da última atualização estará sempre indicada no topo deste documento.

---

## 12. Contato

Para dúvidas sobre esta Política de Privacidade ou sobre o tratamento de seus dados pessoais, entre em contato:

**E-mail:** [A DEFINIR]
**Endereço:** [A DEFINIR, SE APLICÁVEL]

---

*Este documento foi elaborado como rascunho inicial e deve ser revisado por um profissional jurídico antes de sua publicação oficial, especialmente quanto a: prazos de retenção de dados, idade mínima de usuários, cláusulas específicas de LGPD, e conformidade com as exigências da Apple App Store para apps que utilizam HealthKit e processam dados de saúde.*
