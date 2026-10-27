package deepseek

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
)

type Cipher struct{ aead cipher.AEAD }

func NewCipher(encoded string) (*Cipher, error) {
	raw, err := base64.StdEncoding.Strict().DecodeString(encoded)
	if err != nil || len(raw) != 32 {
		return nil, errors.New("invalid AI encryption key")
	}
	block, err := aes.NewCipher(raw)
	if err != nil {
		return nil, errors.New("invalid AI encryption key")
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, errors.New("AI encryption unavailable")
	}
	return &Cipher{aead}, nil
}
func aad(user string, version int64) []byte {
	return []byte(fmt.Sprintf("dblog:deepseek:%s:%d", user, version))
}
func (c *Cipher) Encrypt(user string, version int64, key string) ([]byte, []byte, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, errors.New("AI encryption unavailable")
	}
	return c.aead.Seal(nil, nonce, []byte(key), aad(user, version)), nonce, nil
}
func (c *Cipher) Decrypt(user string, version int64, value, nonce []byte) (string, error) {
	if len(nonce) != c.aead.NonceSize() {
		return "", errors.New("invalid encrypted AI key")
	}
	raw, err := c.aead.Open(nil, nonce, value, aad(user, version))
	if err != nil {
		return "", errors.New("AI key decryption failed")
	}
	return string(raw), nil
}
func ValidKey(key string) bool {
	if len(key) < 8 || len(key) > 512 || strings.TrimSpace(key) != key {
		return false
	}
	for _, r := range key {
		if r < '!' || r > '~' {
			return false
		}
	}
	return true
}
func MaskKey(key string) string {
	if len(key) < 12 {
		return "••••"
	}
	return "••••" + key[len(key)-4:]
}
