import { AnkiReview } from './AnkiReview';

/** 库内全卡主动练习：沿用今日练习阅读面与正式自评，保留标签及自由切卡。 */
export function AnkiBrowse({
  deckId,
  deckName,
  tag = null,
  onExit,
  onSessionSettled = () => {},
}: {
  deckId: string;
  deckName: string;
  refreshToken?: number;
  tag?: string | null;
  onExit: () => void;
  onSessionSettled?: () => void;
}) {
  return (
    <AnkiReview
      decks={[]}
      deckId={deckId}
      deckName={deckName}
      tag={tag}
      browse
      onExit={onExit}
      onSessionSettled={onSessionSettled}
    />
  );
}
