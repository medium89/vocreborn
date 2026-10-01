-- GIF from GIPHY is an external, moderated media URL selected by the client.
ALTER TABLE "messages" ADD COLUMN "gif_url" TEXT;
