import { GoogleGenerativeAI } from '@google/generative-ai';

export async function generateGeminiReleaseNotes(diff, config = {}, logger = console) {
  if (!config.geminiApiKey) {
    return null;
  }

  try {
    const model = new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({
      model: 'gemini-1.5-flash'
    });

    const response = await model.generateContent([
      [
        'Generate concise markdown release notes for this pull request diff.',
        'Focus on user-visible behavior, operational impact, migrations, and risks.',
        'Use this exact structure:',
        '## Release Notes',
        '- Summary:',
        '- Notable changes:',
        '- Risk level:',
        '- Suggested validation:',
        'Do not include line-by-line code review.'
      ].join('\n'),
      String(diff || '').slice(0, 60_000)
    ]);

    const text = response.response.text().trim();
    return text ? text.slice(0, 6000) : null;
  } catch (error) {
    logger.warn({ err: error }, 'Gemini release note generation failed.');
    return null;
  }
}
