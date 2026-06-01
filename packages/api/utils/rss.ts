import { Feed } from "feed";

import serverConfig from "@karakeep/shared/config";
import {
  BookmarkTypes,
  ZPublicBookmark,
} from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

export function toRSS(
  params: {
    title: string;
    description?: string;
    feedUrl: string;
    siteUrl: string;
  },
  bookmarks: ZPublicBookmark[],
) {
  const feed = new Feed({
    id: params.siteUrl,
    title: params.title,
    link: params.siteUrl,
    feedLinks: {
      rss: params.feedUrl,
    },
    description: params.description,
    generator: "Karakeep",
    copyright: "",
  });

  bookmarks
    .filter(
      (b) =>
        b.content.type === BookmarkTypes.LINK ||
        b.content.type === BookmarkTypes.ASSET,
    )
    .forEach((bookmark) => {
      feed.addItem({
        date: bookmark.createdAt,
        title: bookmark.title ?? "",
        link:
          bookmark.content.type === BookmarkTypes.LINK
            ? bookmark.content.url
            : bookmark.content.type === BookmarkTypes.ASSET
              ? `${serverConfig.publicUrl}${getAssetUrl(bookmark.content.assetId)}`
              : "",
        id: bookmark.id,
        author:
          bookmark.content.type === BookmarkTypes.LINK
            ? [{ name: bookmark.content.author ?? undefined }]
            : undefined,
        category: bookmark.tags.map((name) => ({ name })),
        description: bookmark.description ?? "",
      });
    });

  return feed.rss2();
}
