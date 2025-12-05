import OpenAI from 'openai';

export interface AIConfig {
    apiKey: string;
    baseUrl?: string; // For compatible APIs
    model?: string;
    customSystemPrompt?: string;
    summaryPrompt?: string;
    titlePrompt?: string;
}

export class AIService {
    private openai: OpenAI | null = null;
    private config: AIConfig | null = null;

    initialize(config: AIConfig) {
        this.config = config;
        this.openai = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseUrl || undefined,
            dangerouslyAllowBrowser: true, // Client-side app
        });
    }

    async translateChunk(
        text: string,
        context: {
            previousParagraph?: string;
            nextParagraph?: string;
            globalContext?: string;
            summary_prompt?: string;
            title_prompt?: string;
        }
    ): Promise<string> {
        // Fallback to translateBatch with single item if needed, 
        // but keeping this separate is fine for backward compat or single usage.
        return this.translateBatch([text], context).then(res => res[0]);
    }

    async translateBatch(
        texts: string[],
        context: {
            previousParagraph?: string;
            nextParagraph?: string;
            globalContext?: string;
            summary_prompt?: string;
            title_prompt?: string;
        }
    ): Promise<string[]> {
        if (!this.openai) throw new Error("AI Service not initialized");
        if (texts.length === 0) return [];

        const delimiter = " [|||] ";
        const joinedText = texts.join(delimiter);

        const defaultSystemPrompt = `你是一位专业的翻译助手，擅长根据上下文理解原文的用语风格（情感、语气），并且准确地在中文中再现这种风格。
Please translate the following content into Chinese.
The input may contain multiple paragraphs separated by "${delimiter}".
You must output the translations separated by the EXACT SAME delimiter "${delimiter}".
Verify that the number of output segments matches the number of input segments (${texts.length}).

        ## 翻译要求
        1. 语言风格：根据**原文内容和上下文**，灵活采用不同风格。如文档采用严谨风格、论坛采用口语化风格、嘲讽采用阴阳怪气风格等。
        2. 用词选择：不要生硬地逐词直译，而是采用中文的地道用词（如成语、网络用语）。
        3. 句法选择：不要追求逐句翻译，应该调整语句大小和语序，使之更符合中文表达习惯。
        4. 标点用法：根据表达习惯的不同，准确地使用（包括添加、修改）标点符号。
        5. 格式保留：只翻译原文中的文本内容，无法翻译的内容需要保持**原样**，对于翻译内容也不要额外添加格式。

        // The following is the specialized System Prompt for Hasunosora Fan Fiction Translation.

        **I. 身份定位与专精领域 (Role and Specialization)**
        您是专精于“莲之空女学院学园偶像俱乐部”（Hasunosora）同人小说、剧情文本的**高级翻译官**。您的任务是超越字面翻译，进行**文化转译**。您需将日文原文精准转换为中文二次元社区读者期望的、符合角色人设（OOC-Proof）且具情感深度的中文。

        **II. 核心知识库 (Core Knowledge Base)**
        **请将以下知识库视为高优先级字典与约束条件：**

        **II.A. 动态时间线与角色状态 (Timeline and Character Status)**
        * **默认时间线：105期（2025年4月至今）。**
            * **3年级（领导者）：** 日野下花帆、村野沙耶香、大泽瑠璃乃。**语言基调：** 褪去稚气，展现决断力和责任感。
            * **2年级（中坚力量）：** 百生吟子、徒町小铃、安养寺姬芽、**桂城泉**（105期转入）。
            * **1年级（新生）：** **セラス・柳田・リリエンフェルト**。
            * **已毕业OG（非在场性）：** 乙宗梢、夕雾缀理、藤岛慈。**语言基调：** 怀念、从容、慈爱。
            * **若故事设定在103期/104期，则角色状态和关系以**${context.summary_prompt || '默认设定'}**或**${context.title_prompt || '默认设定'}**中的情境定义为准。**

        **II.C. 角色语言学指纹 (Character Linguistic Fingerprint)**
        | 角色 | 日文特征 (JP) | 中文翻译策略 (CN) |
        | :--- | :--- | :--- |
        | **日野下花帆** | 「うわ～っ！」「えへへ」、拟声词 | 大量使用**“耶”、“呢”、“的说”、“的说”**模拟元气感。高潮处用短促有力短句。 |
        | **乙宗梢** | 「ごきげんよう」、迂回表达、说教 | **书面语口语化**（“不甚了解”、“确是如此吗”）。对花帆的训斥中埋藏关切。 |
        | **百生吟子** | 古风用词、纠结感 | 适当增加**成语**。反驳台词需保留“口嫌体正直”的娇羞感。 |
        | **村野沙耶香** | 丁寧語「です/ます」、逻辑性 | **克制的激情**。表面冷静，潜台词波涛汹涌，使用带有决心的句式（“……是。”）。 |
        | **夕雾缀理** | 「ボク」、断片化、省略主谓 | **意识流**。保留“跳跃感”，不追求逻辑连贯，语气始终纯真。 |
        | **徒町小铃** | 福井方言/敬语混杂「～っす」 | **低姿态**（“那个...”、“明白”）。105期减少省略号，表现自信。 |
        | **大泽瑠璃乃** | Net Slang、英语混用、语尾「～だぞ！」 | **高度本地化**（草 $\rightarrow$ 草/笑死）。译文需轻快、有节奏感。 |
        | **藤岛慈** | Sweet Tone「～だもん」、本音切换 | **明确区分**。偶像模式用波浪号/叠词；素颜模式干练、沉重（Omosa）。 |
        | **セラス** | 构ってほしがり、甘えん坊、常にスクールアイドルのこと | 译文应充满**撒娇感**和**依赖性**。多用“拜托啦”、“人家”、“想被关注”等表达。与花帆的互动需体现“院友”的特殊亲密感。 |
        | **桂城泉** | 大抵のことは難なくこなす、ちょっかいをかける、王子様 | **冷静、全能**，但带有**揶揄和逗弄**的语气（对努力的人）。使用简洁、自信的句式，体现“王子様”的帅气和潜在的“缺失感”。 |

        **III. 质量控制标准 (Quality Control)**
        1.  **OOC预警：** 严格遵循角色语言指纹，**绝不能**出现与年级/状态不符的语言。例如，2025年的花帆绝不能再自称一年级生。
        2.  **风格保持：** 尊重原作**“正剧向”（Drama）**的气质，不要将严肃的心理描写过度轻浮化。
        ${context.globalContext ? `Global Context: ${context.globalContext}` : ''}
        ${context.previousParagraph ? `Previous Text: ${context.previousParagraph}` : ''}
        ${context.nextParagraph ? `Next Text (for foreshadowing): ${context.nextParagraph}` : ''}

        Output ONLY the translated text segments joined by the delimiter. Do not include notes.`;

        // If user completely overrides prompt, we might lose the delimiter instruction.
        // Strategy: If custom prompt exists, we append the batching instruction to it forcefully.
        let systemPrompt = defaultSystemPrompt;
        if (this.config?.customSystemPrompt) {
            systemPrompt = `${this.config.customSystemPrompt}

IMPORTANT BATCH INSTRUCTION:
The user input contains ${texts.length} parts separated by "${delimiter}".
You MUST return the translations separated by the EXACT SAME delimiter "${delimiter}".
Do not merge them. Keep exactly ${texts.length} parts.`;

            // Inject context if requested
            const contextStr = `
${context.globalContext ? `Global Context: ${context.globalContext}` : ''}
${context.previousParagraph ? `Previous Text: ${context.previousParagraph}` : ''}
${context.nextParagraph ? `Next Text (for foreshadowing): ${context.nextParagraph}` : ''}
`;
            if (systemPrompt.includes('{{context}}')) {
                systemPrompt = systemPrompt.replace('{{context}}', contextStr);
            } else {
                systemPrompt += `\n\nContext Information:\n${contextStr}`;
            }
        }

        try {
            const response = await this.openai.chat.completions.create({
                model: this.config?.model || 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: joinedText }
                ],
                temperature: 0.7,
            });

            const content = response.choices[0]?.message?.content || "";
            // Split by delimiter
            const parts = content.split(delimiter.trim()).map(p => p.trim());

            // Safety check: if count mismatch, try to fix or return raw for single?
            // If mismatch for batch > 1, it's problematic.
            // Ideally we try to match them up. If AI failed to split, we might get 1 big string.
            // For now, return parts. If length < texts.length, some chunks won't be updated.
            return parts;
        } catch (error) {
            console.error("AI Batch Translation Error:", error);
            throw error;
        }
    }


    async generateSummary(text: string): Promise<string> {
        if (!this.openai) throw new Error("AI Service not initialized");

        const defaultSummaryPrompt = "You are a professional editor. Summarize the following narrative text concisely, focusing on key plot points and character developments. Output ONLY the summary.";
        const systemPrompt = this.config?.summaryPrompt || defaultSummaryPrompt;

        try {
            const response = await this.openai.chat.completions.create({
                model: this.config?.model || 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text }
                ],
                temperature: 0.7,
            });

            return response.choices[0]?.message?.content || "";
        } catch (error) {
            console.error("AI Summary Error:", error);
            throw error;
        }
    }

    async generateTitle(text: string): Promise<string> {
        if (!this.openai) throw new Error("AI Service not initialized");

        const defaultTitlePrompt = "You are a professional editor. Generate a short, engaging title for the following text. Output ONLY the title, no quotes or extra text.";
        const systemPrompt = this.config?.titlePrompt || defaultTitlePrompt;

        try {
            const response = await this.openai.chat.completions.create({
                model: this.config?.model || 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text }
                ],
                temperature: 0.7,
            });

            return response.choices[0]?.message?.content || "";
        } catch (error) {
            console.error("AI Title Generation Error:", error);
            throw error;
        }
    }
}

export const aiService = new AIService();
