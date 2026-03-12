import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";

const uploadDir = path.join(process.cwd(), "public", "uploads");

export const localStorageService = {
  async saveImage(file: File) {
    if (!file.type.startsWith("image/")) {
      throw new Error("Only image files are allowed");
    }

    await mkdir(uploadDir, { recursive: true });

    const extension = file.name.includes(".") ? file.name.split(".").pop() : "png";
    const fileName = `${randomUUID()}.${extension}`;
    const filePath = path.join(uploadDir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());

    await writeFile(filePath, buffer);

    return `/uploads/${fileName}`;
  }
};
