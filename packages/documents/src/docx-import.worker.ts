import mammoth from "mammoth";

const DOCX_WORKER_MAX_HTML_CHARACTERS = 8_000_000;
const DOCX_WORKER_MAX_MESSAGES = 100;

type DocxWorkerRequest = Readonly<{ readonly bytes: ArrayBuffer }>;
type DocxWorkerResponse =
  | Readonly<{ readonly html: string; readonly messageCount: number; readonly type: "success" }>
  | Readonly<{ readonly reason: "corrupt" | "too_complex"; readonly type: "failure" }>;

const scope = globalThis as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  postMessage(message: DocxWorkerResponse): void;
};

const isRequest = (value: unknown): value is DocxWorkerRequest =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (value as Readonly<Record<string, unknown>>)["bytes"] instanceof ArrayBuffer &&
  Object.keys(value).length === 1;

scope.addEventListener("message", (event) => {
  if (!isRequest(event.data)) {
    scope.postMessage(Object.freeze({ type: "failure", reason: "corrupt" }));
    return;
  }
  void mammoth
    .convertToHtml(
      { arrayBuffer: event.data.bytes },
      {
        convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "about:blank" })),
        externalFileAccess: false,
        ignoreEmptyParagraphs: false,
        includeEmbeddedStyleMap: false,
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
        ],
      },
    )
    .then((converted) => {
      if (
        converted.value.length > DOCX_WORKER_MAX_HTML_CHARACTERS ||
        converted.messages.length > DOCX_WORKER_MAX_MESSAGES
      ) {
        scope.postMessage(Object.freeze({ type: "failure", reason: "too_complex" }));
        return;
      }
      scope.postMessage(
        Object.freeze({
          type: "success",
          html: converted.value,
          messageCount: converted.messages.length,
        }),
      );
    })
    .catch(() => {
      scope.postMessage(Object.freeze({ type: "failure", reason: "corrupt" }));
    });
});
