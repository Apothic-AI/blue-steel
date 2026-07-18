type MultiMediaContentPart = image | string

class MultiMediaMessage {
    role "user" | "assistant"
    cacheControl bool
    content MultiMediaContentPart[]
}
