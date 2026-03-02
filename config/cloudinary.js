/**
 * Cloudinary 雲端影像服務設定
 * 
 * 業界標準做法：使用 Cloudinary 儲存影像，取代 Render 本地 ephemeral filesystem
 * 
 * 環境變數：
 *   CLOUDINARY_CLOUD_NAME  - Cloudinary 帳戶名稱
 *   CLOUDINARY_API_KEY     - API Key
 *   CLOUDINARY_API_SECRET  - API Secret
 * 
 * 免費方案含 25GB 空間、25K 轉換/月
 */

const cloudinary = require('cloudinary').v2;

// 設定 Cloudinary（從環境變數載入）
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

/**
 * 上傳影像到 Cloudinary
 * @param {Buffer|string} imageData - 圖片 Buffer 或 base64 data URI
 * @param {Object} options - 上傳選項
 * @param {string} options.folder - 資料夾路徑 (e.g. 'tree_images/123')
 * @param {string} options.publicId - 自訂 public_id
 * @param {string} options.resourceType - 資源類型 ('image')
 * @returns {Promise<Object>} Cloudinary 回傳結果 { secure_url, public_id, ... }
 */
async function uploadImage(imageData, options = {}) {
    const {
        folder = 'tree_images',
        publicId = null,
        resourceType = 'image',
    } = options;

    const uploadOptions = {
        folder,
        resource_type: resourceType,
        // 自動格式轉換與品質優化
        transformation: [
            { quality: 'auto', fetch_format: 'auto' }
        ],
    };

    if (publicId) {
        uploadOptions.public_id = publicId;
    }

    // 如果是 Buffer，轉成 data URI
    let uploadSource;
    if (Buffer.isBuffer(imageData)) {
        uploadSource = `data:image/jpeg;base64,${imageData.toString('base64')}`;
    } else if (typeof imageData === 'string') {
        // 已經是 base64 data URI 或純 base64
        if (imageData.startsWith('data:')) {
            uploadSource = imageData;
        } else {
            uploadSource = `data:image/jpeg;base64,${imageData}`;
        }
    } else {
        throw new Error('imageData 必須是 Buffer 或 string');
    }

    return await cloudinary.uploader.upload(uploadSource, uploadOptions);
}

/**
 * 上傳影像並生成縮圖 URL
 * @param {Buffer|string} imageData - 圖片資料
 * @param {Object} options - 上傳選項
 * @returns {Promise<{url: string, publicId: string, thumbnailUrl: string}>}
 */
async function uploadWithThumbnail(imageData, options = {}) {
    const result = await uploadImage(imageData, options);

    // 使用 Cloudinary 動態轉換生成縮圖 URL（無需額外上傳）
    const thumbnailUrl = cloudinary.url(result.public_id, {
        width: 200,
        height: 200,
        crop: 'fill',
        quality: 'auto',
        fetch_format: 'auto',
    });

    return {
        url: result.secure_url,
        publicId: result.public_id,
        thumbnailUrl,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
    };
}

/**
 * 刪除影像
 * @param {string} publicId - Cloudinary public_id
 * @returns {Promise<Object>} 刪除結果
 */
async function deleteImage(publicId) {
    return await cloudinary.uploader.destroy(publicId);
}

/**
 * 檢查 Cloudinary 設定是否完整
 * @returns {boolean}
 */
function isConfigured() {
    return !!(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
}

module.exports = {
    cloudinary,
    uploadImage,
    uploadWithThumbnail,
    deleteImage,
    isConfigured,
};
