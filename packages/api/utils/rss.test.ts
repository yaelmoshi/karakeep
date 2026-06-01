import { describe, expect, it, vi } from "vitest";

import type { ZPublicBookmark } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

vi.mock("@karakeep/shared/config", () => ({
  default: {
    publicUrl: "https://karakeep.example",
  },
}));

const { toRSS } = await import("./rss");

const baseBookmark = {
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
  modifiedAt: null,
  bannerImageUrl: null,
};

describe("toRSS", () => {
  it("renders link and asset bookmarks while skipping text bookmarks", () => {
    const rss = toRSS(
      {
        title: "Shared list",
        description: "Things worth keeping",
        feedUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com/shared",
      },
      [
        {
          ...baseBookmark,
          id: "link-bookmark",
          title: "Link title",
          description: "Link description",
          tags: ["reading", "tools"],
          content: {
            type: BookmarkTypes.LINK,
            url: "https://example.com/article",
            author: "Ada",
          },
        },
        {
          ...baseBookmark,
          id: "asset-bookmark",
          title: "Asset title",
          description: "Asset description",
          tags: ["archive"],
          content: {
            type: BookmarkTypes.ASSET,
            assetType: "pdf",
            assetId: "asset-id",
            assetUrl: "/api/assets/asset-id",
            fileName: "paper.pdf",
            sourceUrl: null,
          },
        },
        {
          ...baseBookmark,
          id: "text-bookmark",
          title: "Text title",
          description: "Text description",
          tags: ["note"],
          content: {
            type: BookmarkTypes.TEXT,
            text: "A plain note",
          },
        },
      ] satisfies ZPublicBookmark[],
    );

    expect(rss).toContain("<title>Shared list</title>");
    expect(rss).toContain("<description>Things worth keeping</description>");
    expect(rss).toContain("<link>https://example.com/shared</link>");
    expect(rss).toContain('<atom:link href="https://example.com/feed.xml"');
    expect(rss).toContain("<title><![CDATA[Link title]]></title>");
    expect(rss).toContain("<link>https://example.com/article</link>");
    expect(rss).toContain('<guid isPermaLink="false">link-bookmark</guid>');
    expect(rss).toContain("<author>Ada</author>");
    expect(rss).toContain("<category>reading</category>");
    expect(rss).toContain("<category>tools</category>");
    expect(rss).toContain("<title><![CDATA[Asset title]]></title>");
    expect(rss).toContain(
      "<link>https://karakeep.example/api/assets/asset-id</link>",
    );
    expect(rss).toContain('<guid isPermaLink="false">asset-bookmark</guid>');
    expect(rss).not.toContain("Text title");
  });
});
