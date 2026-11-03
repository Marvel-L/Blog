package store

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"
)

const passwordIterations = 600000

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$`)
var ErrCredentials = errors.New("invalid credentials")
var ErrAccountConflict = errors.New("account already bound")
var ErrUnboundData = errors.New("unbound account contains business data")

func ValidUsername(s string) bool { return usernamePattern.MatchString(s) }
func ValidPassword(s string) bool {
	return utf8.ValidString(s) && utf8.RuneCountInString(s) >= 8 && utf8.RuneCountInString(s) <= 128 && len(s) <= 512
}
func PasswordHash(password string) (string, error) {
	if !ValidPassword(password) {
		return "", ErrCredentials
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, passwordIterations, 32)
	if err != nil {
		return "", err
	}
	return "pbkdf2-sha256$600000$" + base64.RawStdEncoding.EncodeToString(salt) + "$" + base64.RawStdEncoding.EncodeToString(key), nil
}
func passwordParts(encoded string) ([]byte, []byte, bool) {
	p := strings.Split(encoded, "$")
	if len(p) != 4 || p[0] != "pbkdf2-sha256" || p[1] != "600000" {
		return nil, nil, false
	}
	salt, err := base64.RawStdEncoding.Strict().DecodeString(p[2])
	key, err2 := base64.RawStdEncoding.Strict().DecodeString(p[3])
	return salt, key, err == nil && err2 == nil && len(salt) == 16 && len(key) == 32
}
func ValidPasswordHash(encoded string) bool { _, _, ok := passwordParts(encoded); return ok }
func VerifyPassword(encoded, password string) bool {
	salt, expected, valid := passwordParts(encoded)
	if !valid {
		salt = make([]byte, 16)
		expected = make([]byte, 32)
	}
	actual, err := pbkdf2.Key(sha256.New, password, salt, passwordIterations, 32)
	return err == nil && subtle.ConstantTimeCompare(actual, expected) == 1 && valid
}
