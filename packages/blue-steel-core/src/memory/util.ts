import { MultiMediaMessage } from '@/ai/baml_client';
import { Image as BamlImage } from '@boundaryml/baml';

export function mergeMessages(messages: MultiMediaMessage[]): MultiMediaMessage[] {
    if (messages.length === 0) return [];
    
    const merged: MultiMediaMessage[] = [];
    let current = messages[0];
    
    for (let i = 1; i < messages.length; i++) {
        if (messages[i].role === current.role) {
            current.content.push(...messages[i].content);
        } else {
            merged.push(current);
            current = messages[i];
        }
    }
    merged.push(current);
    
    return merged;
}