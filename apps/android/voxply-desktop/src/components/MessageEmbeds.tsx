import type { Embed } from "../types";

interface Props {
  embeds: Embed[];
}

export function MessageEmbeds({ embeds }: Props) {
  if (!embeds.length) return null;
  return (
    <div className="message-embeds">
      {embeds.map((e, i) => (
        <div
          key={i}
          className="embed-card"
          style={e.color ? { borderLeftColor: e.color } : undefined}
        >
          <div className="embed-body">
            {e.thumbnail_url && (
              <img className="embed-thumbnail" src={e.thumbnail_url} alt="" />
            )}
            <div className="embed-main">
              {e.title && (
                e.url
                  ? <a className="embed-title" href={e.url} target="_blank" rel="noreferrer">{e.title}</a>
                  : <div className="embed-title">{e.title}</div>
              )}
              {e.description && (
                <div className="embed-description">{e.description}</div>
              )}
              {e.fields && e.fields.length > 0 && (
                <div className="embed-fields">
                  {e.fields.map((f, fi) => (
                    <div key={fi} className={`embed-field${f.inline ? " embed-field--inline" : ""}`}>
                      <div className="embed-field-name">{f.name}</div>
                      <div className="embed-field-value">{f.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {e.image_url && (
            <img className="embed-image" src={e.image_url} alt="" />
          )}
          {e.footer && (
            <div className="embed-footer">{e.footer.text}</div>
          )}
        </div>
      ))}
    </div>
  );
}
