import { GoogleGenerativeAI } from '@google/generative-ai';

export async function generateGeminiArchitectureAnalysis(diff, config = {}, logger = console) {
  if (!config.geminiApiKey) {
    return null;
  }

  try {
    const model = new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({
      model: 'gemini-1.5-flash'
    });

    const response = await model.generateContent([
      [
        'Analyze this code diff strictly for systemic architectural anti-patterns.',
        'Look for broken modular boundaries, leaky abstractions, circular dependency risk, coupling, misplaced responsibilities, and layering violations.',
        'Do not perform line-by-line code styling reviews.',
        'Return concise markdown with this exact heading: ## Architecture Review',
        'If no systemic issues are visible, say so clearly in one sentence.'
      ].join('\n'),
      String(diff || '').slice(0, 60_000)
    ]);

    const text = response.response.text().trim();
    return text ? text.slice(0, 6000) : null;
  } catch (error) {
    logger.warn({ err: error }, 'Gemini architecture analysis failed.');
    return null;
  }
}
