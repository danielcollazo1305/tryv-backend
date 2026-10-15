# Política de Privacidade — Tryv

**Última atualização:** 14/10/2026

> ⚠️ **AVISO IMPORTANTE:** Este documento é um rascunho inicial, criado como ponto de partida. Não constitui aconselhamento jurídico. Antes de publicar este documento ou submeter o app à App Store, recomenda-se revisão por um advogado especializado em proteção de dados (LGPD) e, idealmente, com conhecimento das exigências da Apple para apps que utilizam HealthKit.

---

## 1. Introdução

Esta Política de Privacidade descreve como o **Tryv** ("nós", "nosso" ou "aplicativo") coleta, usa, armazena e protege as informações dos usuários ("você") ao utilizar nosso aplicativo de fitness multiplataforma.

Ao criar uma conta ou usar o Tryv, você concorda com as práticas descritas nesta política.

**Responsável pelo tratamento de dados (Controlador):**
[NOME COMPLETO OU RAZÃO SOCIAL A DEFINIR]
[CPF/CNPJ A DEFINIR]
contato@tryv.com.br

---

## 2. Quais Dados Coletamos

### 2.1 Dados de Cadastro e Perfil
- Nome
- E-mail
- Senha (armazenada de forma criptografada via bcrypt, nunca em texto plano)
- Data de nascimento (obrigatória no cadastro; usada para confirmar a idade mínima de 18 anos e para calcular a meta calórica sugerida)
- Sexo biológico (obrigatório no cadastro, com a opção "prefiro não informar"; usado no cálculo da meta calórica sugerida)
- Percentual de gordura corporal (opcional; usado na estimativa do tempo até a sua meta)
- Nível de treino e equipamentos disponíveis (obrigatórios no cadastro; usados para preencher o pedido de treino gerado por inteligência artificial)
- Cidade e código do município (IBGE) (opcionais; usados no ranking por cidade)
- Peso (obrigatório no cadastro)
- Altura (obrigatória no cadastro)
- Objetivo (ex: emagrecimento, hipertrofia, resistência; obrigatório no cadastro)
- Meta calórica diária (o cadastro sugere um valor, que você pode editar; é preciso informar um valor válido no cadastro)
- Foto de perfil (opcional): um avatar gerado por inteligência artificial a partir de uma selfie (ver seção 5)

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
- Bloqueios de outros usuários e denúncias de posts ou comentários (motivo, detalhes que você escrever e data), feitos ou recebidos, usados para moderação

### 2.6 Lista de Espera (Site)
Se você se inscrever na lista de espera no nosso site, guardamos o endereço de e-mail informado para avisá-lo do lançamento. Se você criar e depois excluir uma conta com o mesmo e-mail, esse registro da lista de espera também é apagado.

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
| **OpenAI** | Geração do avatar estilizado a partir de uma selfie enviada por você. A selfie é processada em memória e enviada à OpenAI; não é guardada por nós (guardamos apenas o avatar gerado) |
| **Resend** | Envio do e-mail de recuperação de senha (o e-mail contém seu nome e o código de verificação) |
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

Para gerar o avatar estilizado a partir de uma selfie, o Tryv utiliza a API de imagens da OpenAI. A selfie é enviada à OpenAI somente para esse processamento; no nosso servidor ela fica apenas em memória e não é guardada por nós (guardamos somente o avatar gerado). Consulte a Política de Privacidade da OpenAI para mais informações sobre como esses dados são tratados por esse fornecedor.

---

## 6. Dados de Saúde (HealthKit) — Seção Específica

Em conformidade com as diretrizes da Apple para uso do HealthKit:

- Solicitamos sua autorização explícita antes de ler qualquer dado no Apple Health
- Você pode revogar essa autorização a qualquer momento em **Ajustes do iPhone → Privacidade e Segurança → Saúde → Tryv**
- **Nunca utilizamos dados de saúde para fins de publicidade**
- Dados de saúde não são compartilhados com terceiros para fins de marketing ou venda de dados
- Os dados de saúde são apagados junto com sua conta, no aplicativo, em **Perfil > Excluir conta** (ver seção 7). Você também pode solicitar por e-mail, conforme a seção 8, a exclusão apenas dos dados de saúde sincronizados com o Tryv, sem excluir a conta

---

## 7. Retenção de Dados

Mantemos seus dados pessoais enquanto sua conta estiver ativa.

### 7.1 Exclusão da conta
Você pode excluir sua conta no próprio aplicativo, em **Perfil > Excluir conta** (o aplicativo pede sua senha e a palavra EXCLUIR). A exclusão é **imediata e irreversível**:
- Seus dados — perfil, treinos, corridas e atividades, refeições, dados de saúde, posts, comentários, curtidas, seguidores, bloqueios e demais dados da conta — são apagados do nosso banco de dados na hora.
- Suas imagens (foto de perfil, fotos de refeições, de posts e de desafios) são removidas do nosso armazenamento de mídia.
- Assinaturas ativas (Pro e de professor) são canceladas na hora, sem reembolso do período já pago.

### 7.2 O que pode permanecer
- **Cópias de segurança:** as cópias de segurança do banco de dados podem permanecer por até 90 dias depois da exclusão, até serem substituídas pela rotação normal, e não são usadas para outro fim.
- **Denúncias de moderação:** o registro de uma denúncia (motivo, estado da análise e datas) é mantido como registro de segurança, sem vínculo com a conta excluída: quem denunciou e o autor denunciado deixam de ser identificáveis, e o trecho do conteúdo do autor excluído que estava guardado na denúncia é descartado.
- **Pagamentos (Stripe):** o Stripe, como processador de pagamentos, mantém registros financeiros por obrigação própria. Ao excluir sua conta, apagamos o seu cadastro de cliente no Stripe quando possível.

### 7.3 Pendências que impedem a exclusão
Profissionais do marketplace precisam antes encerrar seus alunos e desafios ativos, e a conta de recebimentos (Stripe) não pode estar vinculada; o aplicativo informa o que estiver pendente, e você pode falar com o suporte em contato@tryv.com.br. O único administrador precisa transferir a administração antes de excluir a conta.

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

O acesso, a correção e a exclusão dos seus dados podem ser feitos diretamente no aplicativo (editando seu perfil e seus registros e, para excluir tudo, em **Perfil > Excluir conta** — ver seção 7). Para os demais pedidos relacionados a esses direitos, ou se não conseguir usar o aplicativo, entre em contato através de: contato@tryv.com.br.

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

O Tryv não é destinado a menores de 18 anos. O cadastro no aplicativo coleta a data de nascimento e não permite a criação de conta por menores de 18 anos. Não há verificação de documento: a idade é calculada a partir da data de nascimento informada. Não coletamos intencionalmente dados de menores de 18 anos.

---

## 11. Alterações a Esta Política

Podemos atualizar esta Política de Privacidade periodicamente. Notificaremos sobre alterações significativas através do aplicativo ou por e-mail. A data da última atualização estará sempre indicada no topo deste documento.

---

## 12. Contato

Para dúvidas sobre esta Política de Privacidade ou sobre o tratamento de seus dados pessoais, entre em contato:

**E-mail:** contato@tryv.com.br
**Endereço:** [A DEFINIR, SE APLICÁVEL]

---

*Este documento foi elaborado como rascunho inicial e deve ser revisado por um profissional jurídico antes de sua publicação oficial, especialmente quanto a: prazos de retenção de dados, idade mínima de usuários, cláusulas específicas de LGPD, e conformidade com as exigências da Apple App Store para apps que utilizam HealthKit e processam dados de saúde.*
