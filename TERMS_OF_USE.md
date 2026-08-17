# Termos de Uso — Tryv

**Última atualização:** [DATA A DEFINIR]

> ⚠️ **AVISO IMPORTANTE:** Este documento é um rascunho inicial, criado como ponto de partida, e não constitui aconselhamento jurídico. Antes de publicar ou submeter o app à App Store, recomenda-se revisão por um advogado — especialmente as cláusulas de isenção de responsabilidade sobre saúde/nutrição (seção 6), o marketplace de professores (seção 7), a legislação aplicável (seção 13) e o modelo de cobrança via Stripe fora do sistema de compras da Apple (seção 4, ver nota específica).

---

## 1. Aceitação dos Termos

Ao criar uma conta ou utilizar o aplicativo **Tryv** ("aplicativo", "nós", "nosso"), você concorda com estes Termos de Uso e com nossa [Política de Privacidade]. Se você não concordar com estes termos, não deve utilizar o aplicativo.

---

## 2. Elegibilidade

Você deve ter no mínimo **16 (dezesseis) anos** para criar uma conta e utilizar o Tryv. Ao se cadastrar, você declara que possui a idade mínima exigida.

---

## 3. Sua Conta

- Você é responsável por manter a confidencialidade de sua senha e por todas as atividades realizadas em sua conta
- Você deve fornecer informações verdadeiras, precisas e atualizadas no cadastro
- Reservamo-nos o direito de suspender ou encerrar contas que violem estes Termos

---

## 4. Assinaturas e Pagamentos

### 4.1 Plano Base
O Tryv prevê uma assinatura base mensal que dá acesso a funcionalidades de nutrição, treino gerado por IA, rastreamento de atividades via GPS e integração com smartwatch/Apple Health. O valor vigente é exibido no aplicativo no momento da assinatura.

> **Nota de implementação:** hoje o aplicativo ainda não possui um fluxo de compra para este plano base, nem qualquer bloqueio de funcionalidade por assinatura — todas as funcionalidades listadas acima estão disponíveis a qualquer usuário cadastrado, independentemente do status de assinatura. Esta seção descreve um modelo de cobrança planejado, não uma cobrança em vigor. Ajuste o texto (ou adie a publicação desta seção) até o fluxo estar implementado.

### 4.2 Add-on de Professor
Adicionalmente, você pode contratar um professor de educação física através do nosso marketplace, mediante valor definido pelo próprio professor.

### 4.3 Processamento de Pagamentos
Todos os pagamentos são processados através do **Stripe**. O Tryv não armazena dados completos de cartão de crédito.

> ⚠️ **Nota de risco — compliance com a App Store:** hoje, tanto a assinatura de professor (já implementada) quanto o plano base (planejado) processam cobrança inteiramente pelo Stripe Checkout, sem qualquer integração com o sistema de compras da Apple (In-App Purchase/StoreKit). A Diretriz 3.1.1 da App Store exige o uso de IAP para conteúdo, serviços ou funcionalidades digitais consumidas dentro do app, com exceções pontuais (ex: serviços físicos/pessoais consumidos fora do app, alguns marketplaces de serviço). Se a assinatura de professor for entendida pela Apple como "conteúdo digital consumido no app" (e não como intermediação de um serviço físico), o app pode ser rejeitado nesse modelo atual. **Recomenda-se avaliação específica com um especialista em App Store review antes de submeter o app**, e não apenas revisão jurídica genérica — esta é frequentemente a causa nº 1 de rejeição de apps com marketplace/assinatura.

### 4.4 Cancelamento e Reembolso
- Você pode cancelar sua assinatura a qualquer momento através das configurações do aplicativo ou da loja de aplicativos (App Store/Google Play)
- O cancelamento entra em vigor ao final do período de cobrança vigente, salvo disposição em contrário
- Políticas de reembolso seguem as regras da loja de aplicativos utilizada (Apple App Store ou Google Play Store) para compras feitas através delas

> **Nota de implementação:** hoje não existe, dentro do aplicativo, nenhuma função de autoatendimento para cancelar uma assinatura ativa (nem portal de cobrança do Stripe vinculado, nem tela de gerenciamento de assinatura) — cancelamentos precisam ser tratados manualmente pela equipe. Além disso, como as cobranças são feitas via Stripe e não via App Store/Google Play (ver nota da seção 4.3), a referência a "cancelar pela loja de aplicativos" não se aplica na prática a assinaturas cobradas assim — o cancelamento pela loja só valeria para compras processadas pelo sistema de IAP da própria loja, que hoje não é usado.

---

## 5. Conteúdo Gerado pelo Usuário

Ao publicar posts, fotos, comentários ou qualquer outro conteúdo no Tryv, você:
- Mantém a titularidade sobre esse conteúdo
- Concede ao Tryv uma licença não exclusiva, mundial e gratuita para hospedar, exibir e distribuir esse conteúdo dentro do aplicativo, exclusivamente para operar as funcionalidades da plataforma (feed social, perfil, etc.)
- Declara que possui os direitos necessários sobre o conteúdo publicado e que ele não viola direitos de terceiros

O Tryv pode remover conteúdo que viole estes Termos, seja ofensivo, ilegal, ou que infrinja direitos de terceiros, a nosso critério.

---

## 6. Isenção de Responsabilidade — Saúde, Nutrição e Treino (IMPORTANTE)

**Leia esta seção com atenção.**

- O Tryv utiliza inteligência artificial para gerar estimativas nutricionais a partir de fotos de refeições e para gerar sugestões de treino personalizadas. **Essas estimativas e sugestões são geradas automaticamente e podem conter imprecisões.**
- O conteúdo gerado por IA no Tryv **não substitui orientação de nutricionistas, médicos, educadores físicos ou outros profissionais de saúde qualificados.**
- Antes de iniciar qualquer programa de exercícios ou alterar significativamente sua dieta, especialmente se você possui condições de saúde preexistentes, consulte um profissional de saúde qualificado.
- O Tryv não se responsabiliza por lesões, problemas de saúde ou quaisquer danos decorrentes do uso das sugestões de treino ou estimativas nutricionais geradas pelo aplicativo.
- Ao usar as funcionalidades de treino e nutrição, você reconhece que faz isso por sua conta e risco.

---

## 7. Marketplace de Professores

### 7.1 Para Alunos
- Professores disponíveis no marketplace declaram possuir registro profissional válido (CREF), verificado no momento do cadastro
- O Tryv atua como intermediário tecnológico entre alunos e professores, mas **não é parte na relação de prestação de serviços** entre você e o professor contratado
- A qualidade, adequação e resultados dos treinos e orientações fornecidas pelo professor são de responsabilidade do próprio profissional contratado
- Enquanto sua assinatura com um professor estiver ativa, ele pode ver quando você está com uma atividade em andamento e acompanhar, em tempo real, sua localização e métricas dessa atividade (ver Política de Privacidade, seção 4.1, para o escopo exato)

### 7.2 Para Professores
- Você declara possuir registro profissional válido e ativo (CREF) para atuar como educador físico
- O Tryv cobra uma comissão sobre os valores recebidos através da plataforma: **20% (vinte por cento)** como padrão, reduzida para **12% (doze por cento)** quando você tiver criado pelo menos um desafio para seus alunos nos últimos 30 dias
- Os repasses são processados através do Stripe Connect
- Você é responsável por cumprir suas próprias obrigações fiscais e regulatórias referentes aos valores recebidos através da plataforma

---

## 8. Uso do HealthKit / Apple Health

Ao autorizar a integração com o Apple Health, você permite que o Tryv **leia** dados de saúde conforme descrito em nossa Política de Privacidade. Você pode revogar essa autorização a qualquer momento nas configurações do seu iPhone.

---

## 9. Condutas Proibidas

Ao usar o Tryv, você concorda em não:
- Publicar conteúdo ilegal, ofensivo, discriminatório ou que viole direitos de terceiros
- Utilizar o aplicativo para fins fraudulentos ou enganosos
- Tentar acessar dados de outros usuários sem autorização
- Utilizar bots, scripts automatizados ou qualquer meio para manipular métricas do aplicativo (curtidas, seguidores, desafios)
- Se passar por outra pessoa ou entidade
- Interferir na segurança ou funcionamento do aplicativo

---

## 10. Propriedade Intelectual

O aplicativo Tryv, sua marca, design, código-fonte e demais elementos (exceto o conteúdo gerado pelos usuários) são de propriedade do Tryv e protegidos por leis de propriedade intelectual. Nenhuma disposição destes Termos concede a você direitos sobre essa propriedade, além do direito limitado de uso do aplicativo conforme estes Termos.

---

## 11. Limitação de Responsabilidade

Na máxima extensão permitida pela lei aplicável, o Tryv não se responsabiliza por danos indiretos, incidentais ou consequenciais decorrentes do uso do aplicativo, incluindo, mas não se limitando a: perda de dados, lesões físicas decorrentes de treinos, decisões nutricionais baseadas em estimativas de IA, ou disputas entre alunos e professores contratados através do marketplace.

> ⚠️ **Nota para revisão jurídica:** cláusulas de limitação de responsabilidade têm validade variável conforme jurisdição e tipo de dano (o Código de Defesa do Consumidor brasileiro impõe limites a esse tipo de cláusula em relações de consumo). Recomenda-se validação específica desta seção.

---

## 12. Encerramento

Você pode encerrar sua conta a qualquer momento através das configurações do aplicativo. O Tryv pode suspender ou encerrar sua conta em caso de violação destes Termos, mediante notificação, exceto em casos de violação grave, quando o encerramento pode ser imediato.

> **Nota de implementação:** hoje não existe, dentro do aplicativo, nenhuma função de autoexclusão de conta — o encerramento precisa ser solicitado por contato direto (ver Política de Privacidade, seção 8) e processado manualmente pela equipe.

---

## 13. Legislação Aplicável e Foro

Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de [CIDADE A DEFINIR] para dirimir quaisquer controvérsias decorrentes destes Termos, com renúncia a qualquer outro, por mais privilegiado que seja.

---

## 14. Alterações a Estes Termos

Podemos atualizar estes Termos periodicamente. Alterações significativas serão comunicadas através do aplicativo ou por e-mail. O uso continuado do Tryv após tais alterações constitui aceitação dos novos Termos.

---

## 15. Contato

Para dúvidas sobre estes Termos de Uso, entre em contato:

**E-mail:** [A DEFINIR]

---

*Este documento foi elaborado como rascunho inicial e deve ser revisado por um profissional jurídico antes de sua publicação oficial, especialmente quanto a: cláusulas de responsabilidade sobre saúde/nutrição, relação com professores do marketplace, limitação de responsabilidade à luz do Código de Defesa do Consumidor, foro/jurisdição aplicável, e o modelo de cobrança via Stripe fora do sistema de compras da Apple (risco de rejeição na App Store — ver seção 4.3).*
