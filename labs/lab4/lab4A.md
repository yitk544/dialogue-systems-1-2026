# Lab 4A - ASR Case Study Report

## Test Cases

I tested a variety of proper nouns with the Azure ASR system, including fictional Chinese names, real Chinese place names, and historical figures, to observe how well the system handles out-of-vocabulary and non-English words.

### Results

| Word spoken      | ASR recognized    | Confidence |
|------------------|-------------------|------------|
| Sun Wukong       | Sun Wukong        | 0.15       |
| Huaguo Mountain  | Hua Guo Mountain  | 0.36       |
| Penglai          | Pong Lai          | 0.12       |
| Beijing          | Beijing           | 0.84       |
| Shanghai         | Shanghai          | 0.84       |
| Confucius        | Confucius         | 0.84       |
| Qin Shi Huang    | Xing Shi Huang    | 0.29       |

## Observations

There is a clear pattern in the results. Common and internationally well-known words like "Beijing", "Shanghai", and "Confucius" were recognized correctly with high confidence (around 0.84). These words appear frequently in English-language training data, so the model handles them well.

However, less internationally known Chinese names performed poorly. "Penglai" became "Pong Lai" (0.12), and "Qin Shi Huang" became "Xing Shi Huang" (0.29).

## Accent and Recognition

As a native Chinese speaker, my pronunciation of Mandarin-origin words may differ from the English pronunciation assumed by the ASR model. For example, "Qin" in Mandarin is pronounced differently from how an English speaker would say it, which likely contributed to the misrecognition as "Xing".

## How to Access Confidence Score in TypeScript

The confidence score is stored in `context.lastResult[0].confidence`:
```typescript
const confidence = context.lastResult?.[0]?.confidence;
const utterance = context.lastResult?.[0]?.utterance;
console.log(`Utterance: ${utterance}, Confidence: ${confidence}`);
```
The scores vary greatly. Internationally known words like "Beijing"  and "Shanghai" scored above 0.8, which is good. However, most  Chinese fictional names scored below 0.3, indicating poor recognition  quality for out-of-vocabulary words.

## Why Does Recognition Falter?

The Azure ASR model is trained primarily on standard American and
British English speech. Words that rarely appear in English text or
audio, such as fictional Chinese place names (Huaguo Mountain, Penglai)
or historical Chinese figures (Qin Shi Huang), fall outside the model's
training distribution. As a result, the model maps these words to the
nearest phonetically similar words it knows, producing incorrect
transcriptions with low confidence scores.

A possible solution is to use Azure Custom Speech, where
custom vocabulary and audio samples can be provided to train the model
to recognize specific out-of-vocabulary words correctly.